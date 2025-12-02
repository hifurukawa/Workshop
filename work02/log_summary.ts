#!/usr/bin/env node
// 可搬性のためシバンを追加
'use strict';

// Node.js 標準モジュールのみ利用（外部パッケージなし）
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

// 型エラーを避けるための宣言
declare const require: any;
declare const process: any;
declare const module: any;

// 認証メソッドの種類
type AuthMethod = 'publickey' | 'password';

// 成否
type AuthResult = 'success' | 'failure';

// 1行の認証ログから抜き出した情報
interface AuthInfo {
  result: AuthResult;
  user: string;
  method: AuthMethod;
  ip?: string; // 失敗時にIP集計で利用
}

// 統計全体をまとめて持つ構造体
interface Stats {
  successCounts: Map<string, number>;        // key: "user\tmethod"
  failureCountsUserMethod: Map<string, number>;
  failureCountsByIp: Map<string, number>;    // key: ip
  totalFailures: number;
}

/**
 * メイン処理
 * - 引数チェック
 * - gzファイル読み込み＆集計
 * - 結果表示
 * - パフォーマンス表示
 */
async function main(): Promise<void> {
  const startTimeNs = process.hrtime.bigint(); // ★高精度タイマー

  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: node log_summary.ts <logfile.gz>');
    process.exitCode = 1;
    return;
  }

  const logFile = args[0];

  if (!fs.existsSync(logFile)) {
    console.error(`Input file not found: ${logFile}`);
    process.exitCode = 1;
    return;
  }

  const stats: Stats = {
    successCounts: new Map<string, number>(),
    failureCountsUserMethod: new Map<string, number>(),
    failureCountsByIp: new Map<string, number>(),
    totalFailures: 0,
  };

  try {
    await processLogFile(logFile, stats);

    // 集計結果の表示
    printAuthSuccesses(stats);
    console.log();
    printAuthFailures(stats);
    console.log();
    printAuthFailuresByIp(stats);
    console.log();

    // パフォーマンス計測結果の表示
    const endTimeNs = process.hrtime.bigint();
    const elapsedMs = Number(endTimeNs - startTimeNs) / 1_000_000; // ns → ms

    const usage = process.resourceUsage(); // ★process.resourceUsage
    const rssMiB = usage.maxRSS / 1024;    // maxRSS は KiB 単位なので MiB へ変換

    console.log(
      `Performance: time=${elapsedMs.toFixed(3)}ms rss=${rssMiB.toFixed(2)}MiB`
    );
  } catch (err: any) {
    console.error('Unexpected error:', err?.message ?? err);
    process.exitCode = 1;
  }
}

/**
 * gzip圧縮されたログファイルをストリームで読みながら1行ずつ処理
 */
function processLogFile(logFile: string, stats: Stats): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fileStream = fs.createReadStream(logFile);
    const gunzip = zlib.createGunzip();

    fileStream.on('error', (err: Error) => {
      console.error(`Failed to read file: ${err.message}`);
      reject(err);
    });

    gunzip.on('error', (err: Error) => {
      console.error(`Failed to decompress gzip: ${err.message}`);
      reject(err);
    });

    const rl = readline.createInterface({
      input: fileStream.pipe(gunzip),
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      const info = parseAuthLine(line);
      if (info) {
        updateStats(stats, info);
      }
      // ログフォーマット不一致行は info === null としてスキップ
    });

    rl.on('close', () => {
      resolve();
    });
  });
}

/**
 * 1行のログから sshd の認証情報をパースする
 * 対象:
 *   Accepted publickey for USER from IP ...
 *   Accepted password for USER from IP ...
 *   Failed  password for USER from IP ...
 *   Failed  password for invalid user USER from IP ...
 *
 * フォーマット不一致は null を返す
 */
function parseAuthLine(line: string): AuthInfo | null {
  // sshd 以外のログは興味がないので早期リターン
  if (!line.includes('sshd')) {
    return null;
  }

  // Accepted ログ
  const acceptedMatch = line.match(
    /sshd(?:\[\d+\])?:\s+Accepted (publickey|password) for (\S+) from (\S+)/
  );
  if (acceptedMatch) {
    const method = acceptedMatch[1] as AuthMethod;
    const user = acceptedMatch[2];
    const ip = acceptedMatch[3];
    return {
      result: 'success',
      user,
      method,
      ip,
    };
  }

  // Failed ログ
  const failedMatch = line.match(
    /sshd(?:\[\d+\])?:\s+Failed password for (?:invalid user )?(\S+) from (\S+)/
  );
  if (failedMatch) {
    const user = failedMatch[1];
    const ip = failedMatch[2];
    return {
      result: 'failure',
      user,
      method: 'password',
      ip,
    };
  }

  // syslog形式でない or sshd の認証ログでない場合はスキップ
  return null;
}

/**
 * 統計情報を更新する
 */
function updateStats(stats: Stats, info: AuthInfo): void {
  const key = makeUserMethodKey(info.user, info.method);

  if (info.result === 'success') {
    incrementMap(stats.successCounts, key);
  } else {
    incrementMap(stats.failureCountsUserMethod, key);
    stats.totalFailures += 1;

    if (info.ip) {
      incrementMap(stats.failureCountsByIp, info.ip);
    }
  }
}

/**
 * Map のカウンタを 1 増やすユーティリティ
 */
function incrementMap(map: Map<string, number>, key: string): void {
  const current = map.get(key) ?? 0;
  map.set(key, current + 1);
}

/**
 * "user\tmethod" 形式でキーを作成
 */
function makeUserMethodKey(user: string, method: string): string {
  return `${user}\t${method}`;
}

/**
 * キー文字列から user と method を取り出す
 */
function splitUserMethodKey(key: string): { user: string; method: string } {
  const [user, method] = key.split('\t');
  return { user, method };
}

/**
 * 認証成功の集計結果を表示する（全件）
 */
function printAuthSuccesses(stats: Stats): void {
  type Row = { user: string; method: string; count: number };
  const rows: Row[] = [];

  for (const [key, count] of stats.successCounts.entries()) {
    const { user, method } = splitUserMethodKey(key);
    rows.push({ user, method, count });
  }

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count; // 成功数 降順
    if (a.user !== b.user) return a.user.localeCompare(b.user); // ユーザー 昇順
    return a.method.localeCompare(b.method); // メソッド 昇順
  });

  console.log('Authentication successes (all):');
  console.log('  User       Method      Success');
  console.log('  ------------------------------');

  for (const row of rows) {
    console.log(
      `  ${padRight(row.user, 10)} ${padRight(row.method, 10)} ${row.count}`
    );
  }
}

/**
 * 認証失敗の集計結果を表示する（上位10件）
 */
function printAuthFailures(stats: Stats): void {
  type Row = { user: string; method: string; count: number };
  const rows: Row[] = [];

  for (const [key, count] of stats.failureCountsUserMethod.entries()) {
    const { user, method } = splitUserMethodKey(key);
    rows.push({ user, method, count });
  }

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count; // 失敗数 降順
    if (a.user !== b.user) return a.user.localeCompare(b.user); // ユーザー 昇順
    return a.method.localeCompare(b.method); // メソッド 昇順
  });

  const top10 = rows.slice(0, 10);

  console.log('Authentication failures (top 10):');
  console.log('  User       Method      Failure');
  console.log('  ------------------------------');

  for (const row of top10) {
    console.log(
      `  ${padRight(row.user, 10)} ${padRight(row.method, 10)} ${row.count}`
    );
  }

  console.log();
  console.log(`Total authentication failures: ${stats.totalFailures}`);
}

/**
 * IPごとの認証失敗数を表示する（上位10件）
 */
function printAuthFailuresByIp(stats: Stats): void {
  type Row = { ip: string; count: number };
  const rows: Row[] = [];

  for (const [ip, count] of stats.failureCountsByIp.entries()) {
    rows.push({ ip, count });
  }

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count; // 失敗数 降順
    return a.ip.localeCompare(b.ip); // IP 昇順
  });

  const top10 = rows.slice(0, 10);

  console.log('Authentication failures by IP (top 10):');
  console.log('  IP                 Failure');
  console.log('  -------------------------');

  for (const row of top10) {
    console.log(`  ${padRight(row.ip, 18)} ${row.count}`);
  }
}

/**
 * 簡易な右パディング
 */
function padRight(value: string, length: number): string {
  if (value.length >= length) return value;
  return value + ' '.repeat(length - value.length);
}

// メイン実行
main();
