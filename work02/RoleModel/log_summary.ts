/**
 * SSH認証ログ集計プログラム
 *
 * @file Gzip圧縮されたsyslog形式のSSH認証ログを集計して統計を出力する
 * @author 山崎
 */

import fs from "node:fs";
import zlib from "node:zlib";
import process from "node:process";

// #region ===== 設定 =====

// 表示上限設定（undefinedで全件表示）
const SUCCESS_TOP_N: number | undefined = undefined;
const FAILURE_TOP_N: number | undefined = 10;

// テーブル列名
const USER_LABEL = "User";
const METHOD_LABEL = "Method";
const SUCCESS_LABEL = "Success";
const FAILURE_LABEL = "Failure";
const IP_LABEL = "IP";

/**
 * syslog形式のsshd認証ログから認証情報を抽出する正規表現
 *
 * @remarks
 * MMM dd HH:MM:SS host sshd[pid]: message
 *   message -> 認証成功
 *     Accepted publickey for USER from IP ...
 *     Accepted password for USER from IP ...
 *   message -> 認証失敗
 *     Failed password for USER from IP ...
 *     Failed password for invalid user USER from IP ...
 * @example
 * Feb 17 17:24:43 vagrant sshd[4157838]: Failed password for invalid user ubuntu from 192.168.0.51 port 12028 ssh2
 * Apr 20 08:37:45 vagrant kernel: kauditd_printk_skb: 20 callbacks suppressed
 * Jun 05 18:49:37 vagrant sshd[135134]: Accepted publickey for vagrant from 10.0.2.2 port 37276 ssh2: RSA SHA256:hRLKT8BqnbFxHlxjDB3OLXznk2/Pox3NF/Rt+FQ0CUw
 * Jun 07 16:52:01 vagrant sshd[145418]: Accepted password for vagrant from 192.168.0.51 port 5494 ssh2
 * Jun 12 01:13:11 vagrant sshd[279531]: Failed password for root from 192.168.250.40 port 41486 ssh2
 */
const SYSLOG_SSHD_AUTHENTICATION_REGEX =
  // /^[A-Z][a-z]{2} \d{2} \d{2}:\d{2}:\d{2} \S+ sshd\[\d+\]: (?<status>Accepted|Failed) (?<method>publickey|password) for (?:invalid user )?(?<user>\S+) from (?<ip>\S+)/;
  // NOTE: こっちの方が微妙に早い
  /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2} \d{2}:\d{2}:\d{2} \S+ sshd\[\d+\]: (?<status>Accepted|Failed) (?<method>publickey|password) for (?:invalid user )?(?<user>\S+) from (?<ip>\S+)/;

// #endregion ===== 設定 =====

/**
 * SSH認証ステータス
 *
 * - Accepted 認証成功
 * - Failed 認証失敗
 */
type AuthStatus = "Accepted" | "Failed";

/**
 * SSH認証方式
 *
 * - publickey 公開鍵認証
 * - password パスワード認証
 */
type AuthMethod = "publickey" | "password";

/**
 * ユーザー・認証方式ごとの認証統計
 */
interface AuthStats {
  /** ユーザー名 */
  user: string;
  /** 認証方式 */
  method: AuthMethod;
  /** 認証回数 */
  count: number;
}

// #region ===== 出力処理 =====

/**
 * 表のカラム定義
 */
type TableColumn = {
  /** ヘッダー名 */
  header: string;
  /** カラム幅 */
  width: number;
  /** 左寄せ/右寄せ */
  align: "left" | "right";
};

/**
 * 汎用テーブル出力関数
 */
function printTable(
  /** 表タイトル */
  label: string,
  /** カラム定義 */
  columns: TableColumn[],
  /** 行データ */
  rows: string[][],
  /** 省略記号表示 */
  showEllipsis?: boolean
): void {
  // タイトル
  console.log(`${label}:`);
  if (rows.length === 0) {
    console.log("  (no records)");
    return;
  }

  // ヘッダー
  const headerLine = columns
    .map((col) =>
      col.align === "left"
        ? col.header.padEnd(col.width)
        : col.header.padStart(col.width)
    )
    .join(" ");
  console.log("  " + headerLine);
  console.log("  " + "-".repeat(headerLine.length));

  // 行データ
  for (const row of rows) {
    const line = columns
      .map((col, i) =>
        col.align === "left"
          ? row[i].padEnd(col.width)
          : row[i].padStart(col.width)
      )
      .join(" ");
    console.log("  " + line);
  }

  // 省略記号
  if (showEllipsis) {
    console.log("  ...");
  }
}

/**
 * 認証統計表のカラム幅を計算
 *
 * @returns {{ userWidth: number, methodWidth: number, countWidth: number }}
 */
function getStatsWidths(
  /** 認証成功統計配列 */
  successStats: AuthStats[],
  /** 認証失敗統計配列 */
  failureStats: AuthStats[],
  /** 成功表示上限 */
  successTopN?: number,
  /** 失敗表示上限 */
  failureTopN?: number
) {
  const showSuccess = successStats.slice(0, successTopN);
  const showFailure = failureStats.slice(0, failureTopN);

  // 最低幅（ラベルの長さ）
  let userWidth = USER_LABEL.length;
  let methodWidth = METHOD_LABEL.length;
  let countWidth = Math.max(SUCCESS_LABEL.length, FAILURE_LABEL.length);

  // データ幅を計算
  for (const s of [...showSuccess, ...showFailure]) {
    if (s.user.length > userWidth) userWidth = s.user.length;
    if (s.method.length > methodWidth) methodWidth = s.method.length;
    const countLen = String(s.count).length;
    if (countLen > countWidth) countWidth = countLen;
  }

  return {
    /** ユーザー列幅 */
    userWidth,
    /** 認証方式列幅 */
    methodWidth,
    /** カウント列幅 */
    countWidth,
  };
}

/**
 * 認証統計表の出力
 */
function printStats(
  /** 統計データ */
  stats: AuthStats[],
  /** 表タイトル */
  titleLabel: string,
  /** カウント列ラベル */
  countLabel: string,
  /** ユーザー列幅 */
  userWidth: number,
  /** 認証方式列幅 */
  methodWidth: number,
  /** カウント列幅 */
  countWidth: number,
  /** 表示上限 */
  topN?: number
): void {
  // 表示上限で切り出し
  const data = topN ? stats.slice(0, topN) : stats;

  // カラム定義
  const columns: TableColumn[] = [
    { header: USER_LABEL, width: userWidth, align: "left" },
    { header: METHOD_LABEL, width: methodWidth, align: "left" },
    { header: countLabel, width: countWidth, align: "right" },
  ];

  // 行データ
  const rows = data.map((s) => [s.user, s.method, String(s.count)]);

  // 省略記号
  const showEllipsis = Boolean(topN && stats.length > topN);

  printTable(titleLabel, columns, rows, showEllipsis);
}

/**
 * IPごとの認証失敗数を出力
 */
function printFailuresByIp(
  /** IPごとの失敗数配列 */
  entries: [string, number][],
  /** 表示上限 */
  topN?: number
): void {
  // 表示上限で切り出し
  const data = entries.slice(0, topN);

  // カラム幅計算
  let ipWidth = IP_LABEL.length;
  let failureWidth = FAILURE_LABEL.length;
  for (const [ip, count] of data) {
    if (ip.length > ipWidth) ipWidth = ip.length;
    const len = String(count).length;
    if (len > failureWidth) failureWidth = len;
  }

  // カラム定義
  const columns: TableColumn[] = [
    { header: IP_LABEL, width: ipWidth, align: "left" },
    { header: FAILURE_LABEL, width: failureWidth, align: "right" },
  ];

  // 行データ
  const rows = data.map(([ip, count]) => [ip, String(count)]);

  // 省略記号
  const showEllipsis = Boolean(topN && entries.length > topN);

  printTable(
    `Authentication failures by IP (${topN ? `top ${topN}` : "all"})`,
    columns,
    rows,
    showEllipsis
  );
}

// #endregion ===== 出力処理 =====

/**
 * ログ集計
 *
 * - gzファイル読み込み・展開
 * - 行分割
 * - 集計
 * - 出力
 * @returns {Promise<void>}
 */
async function summary(): Promise<void> {
  const [, , filePath] = process.argv;

  // パラメータチェック
  if (!filePath) {
    console.error("Usage: node log_summary.ts <logfile.gz>");
    process.exitCode = 1; // パラメータエラー
    return;
  }

  // ユーザー方式成功統計
  const successMap = new Map<string, AuthStats>();
  // ユーザー方式失敗統計
  const failureMap = new Map<string, AuthStats>();
  // IP失敗統計
  const ipFailureMap = new Map<string, number>();
  // エラーフラグ
  let fatalError = false;
  // バッファ
  let buffer = "";

  const readStream = fs.createReadStream(filePath);
  const gunzip = zlib.createGunzip({
    chunkSize: readStream.readableHighWaterMark,
  });

  // #region ===== 集計処理 =====

  /**
   * ユーザー方式統計カウントアップ
   */
  const incrementStats = (
    /** 統計Map */
    map: Map<string, AuthStats>,
    /** ユーザー名 */
    user: string,
    /** 認証方式 */
    method: AuthMethod
  ): void => {
    const key = `${user}\t${method}`;
    let stats = map.get(key);
    if (!stats) {
      stats = { user, method, count: 0 };
      map.set(key, stats);
    }
    stats.count += 1;
  };

  /**
   * IP失敗統計カウントアップ
   */
  const incrementIpFailure = (
    /** IPアドレス */
    ip: string
  ): void => {
    const prev = ipFailureMap.get(ip) ?? 0;
    ipFailureMap.set(ip, prev + 1);
  };

  /**
   * 行解析
   */
  const lineParser = (
    /** 行内容 */
    line: string
  ): void => {
    // 認証ログ
    const authenticationMatch = SYSLOG_SSHD_AUTHENTICATION_REGEX.exec(line);
    if (authenticationMatch) {
      const { status, method, user, ip } = authenticationMatch.groups as {
        status: AuthStatus;
        method: AuthMethod;
        user: string;
        ip: string;
      };
      if (status === "Accepted") {
        // 認証成功
        incrementStats(successMap, user, method);
      } else {
        // 認証失敗
        incrementStats(failureMap, user, method);
        incrementIpFailure(ip);
      }
    }

    // その他のログは無視
  };

  // 行分割
  gunzip.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);

      // 行解析
      lineParser(line);
    }
  });

  // 終了待機
  await new Promise<void>((resolve) => {
    // データ終了時
    gunzip.on("end", () => {
      // 残りのバッファに行があれば処理
      if (buffer.length > 0) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          // 行解析
          lineParser(line);
        }
      }
      // 終了
      resolve();
    });

    // エラー発生時
    readStream.on("error", (err) => {
      fatalError = true;
      console.error(`Failed to read file: ${(err as Error).message}`);
      process.exitCode = 2; // ファイルエラー
      // 終了
      resolve();
    });
    gunzip.on("error", (err) => {
      fatalError = true;
      console.error(`Failed to decompress gzip: ${(err as Error).message}`);
      process.exitCode = 2; // gzip 展開エラー
      // 終了
      resolve();
    });

    // 処理開始
    readStream.pipe(gunzip);
  });

  // #endregion ===== 集計処理 =====

  // エラー時は集計出力しない
  if (fatalError) return;

  // #region ===== 出力1：認証結果数 =====

  // ソート関数（count降順 -> user昇順 -> method昇順）
  const statsSort = (a: AuthStats, b: AuthStats) =>
    b.count - a.count ||
    a.user.localeCompare(b.user) ||
    a.method.localeCompare(b.method);

  // ソート済み配列を作成
  const sortedSuccessStats = Array.from(successMap.values()).sort(statsSort);
  const sortedFailureStats = Array.from(failureMap.values()).sort(statsSort);

  // カラム幅計算
  const { userWidth, methodWidth, countWidth } = getStatsWidths(
    sortedSuccessStats,
    sortedFailureStats,
    SUCCESS_TOP_N,
    FAILURE_TOP_N
  );

  // テーブル出力
  printStats(
    sortedSuccessStats,
    `Authentication successes (${SUCCESS_TOP_N ? `top ${SUCCESS_TOP_N}` : "all"})`,
    SUCCESS_LABEL,
    userWidth,
    methodWidth,
    countWidth
  );

  // 空行
  console.log();

  // テーブル出力
  printStats(
    sortedFailureStats,
    `Authentication failures (${FAILURE_TOP_N ? `top ${FAILURE_TOP_N}` : "all"})`,
    FAILURE_LABEL,
    userWidth,
    methodWidth,
    countWidth,
    FAILURE_TOP_N
  );

  // 空行
  console.log();

  // 合計認証失敗数
  const totalFailures = Array.from(failureMap.values()).reduce(
    (acc, s) => acc + s.count,
    0
  );
  console.log(`Total authentication failures: ${totalFailures}`);

  // #endregion ===== 出力1：認証結果数 =====

  // #region ===== 出力2：IP ごとの認証失敗数 =====

  // 空行
  console.log();

  // ソート
  const ipEntries = Array.from(ipFailureMap.entries()).sort((a, b) => {
    const [ipA, countA] = a;
    const [ipB, countB] = b;
    return countB - countA || ipA.localeCompare(ipB);
  });
  printFailuresByIp(ipEntries, FAILURE_TOP_N);

  // #endregion ===== 出力2：IP ごとの認証失敗数 =====
}

/**
 * メイン処理
 *
 * - 集計処理
 * - パフォーマンス計測
 * - 未定義エラー処理
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  // パフォーマンス計測開始
  const startHr = process.hrtime.bigint();

  try {
    // 集計処理
    await summary();
  } catch (err) {
    // 未定義エラー処理
    console.error(`Unexpected error: ${(err as Error).message}`);
    process.exitCode = 99;
  } finally {
    // パフォーマンス計測終了
    const endHr = process.hrtime.bigint();
    const durationMs = Number(endHr - startHr) / 1_000_000;

    const { maxRSS } = process.resourceUsage(); // kilobytes

    const timeMs = Math.round(durationMs);
    const rssMiB = Math.round(maxRSS / 1024);

    console.log();
    console.log(`Performance: time=${timeMs}ms rss=${rssMiB}MiB`);
  }
}

// エントリーポイント
main();
