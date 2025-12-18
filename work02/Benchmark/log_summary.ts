/*  log_summary   */
/**
 * 全体処理：
 *・ログファイルの解凍・読込
 *・ロジックの処理
 * ・sshd以外スキップ
 * ・sshd対象のみの集計、message部分を処理
 *    Accept :User + Method + NUMBER（全件）
 *    Failure：User + Method + NUMBER（TOP 10位）
 *      →IP統計 + NUMBER（TOP 10位）
 * ・Performance処理
 *    process.hrtime →実行時間
 *    process.resourceUsage().maxRSS →最大使用メモリ量
 */

// Node.js コアモジュールの利用
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import * as readline from 'node:readline';

// ===============================================================
// 正規表現（ログ解析用）
// ===============================================================

/**
 * syslog の 1 行を分解する正規表現。
 *
 * 形式: "MMM dd HH:MM:SS host pname[pid]: message"
 *
 * 例:
 *   Feb 17 17:24:43 vagrant sshd[4157838]: Failed password ...
 *
 * グループ:
 *   1: 月・日付・時刻 (MMM dd HH:MM:SS)
 *   2: ホスト名 (host)
 *   3: プログラム名 (pname) 例: sshd
 *   4: プロセス ID (pid) ※存在しない場合もあるためオプション
 *   5: メッセージ本体 (message)
 */
const SYSLOG_LINE_REGEX = /^([A-Z][a-z]{2}\s+\d+\s\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^\s\[]+)(?:\[(\d+)\])?:\s+(.*)$/;

/**
 * sshd 認証成功ログ用の正規表現。
 *
 * 例:
 *   Accepted publickey for USER from IP ...
 *   Accepted password  for USER from IP ...
 *
 * グループ:
 *   1: 認証方式 (publickey / password など)
 *   2: ユーザー名
 *   3: IP アドレス
 */
const ACCEPTED_REGEX = /^Accepted\s+(\S+)\s+for\s+(\S+)\s+from\s+(\S+)/;

/**
 * sshd 認証失敗ログ用の正規表現。
 *
 * 例:
 *   Failed password for USER from IP ...
 *   Failed password for invalid user USER from IP ...
 *
 * グループ:
 *   1: 認証方式 (password)
 *   2: ユーザー名
 *   3: IP アドレス
 */
const FAILED_REGEX = /^Failed\s+(\S+)\s+for\s+(?:invalid\s+user\s+)?(\S+)\s+from\s+(\S+)/;

// ===============================================================
// 型定義
// ===============================================================

/**
 * 1 つの認証方式ごとの成功・失敗回数を保持するための型です。
 */
interface AuthStats {
  success: number;
  failure: number;
}

/**
 * 1 ユーザーごとに、認証方式ごとの統計情報を保持するための型です。
 * 例: vagrant → { "publickey": {success: 10, failure: 0}, "password": {...} }
 */
interface UserStats {
  methods: Map<string, AuthStats>;
}

// 出力エラーコード
const EXIT_USAGE = 1;
const EXIT_FILE_ERROR = 2;
const EXIT_GZIP_ERROR = 3;
const EXIT_PROCESSING_ERROR = 4;


// ===============================================================
// メイン処理
// ===============================================================

/**
 * プログラム全体のエントリポイントです。
 *
 * 処理の流れ:
 *   1. コマンドライン引数の検証
 *   2. gzip 圧縮ログファイルのストリームを開く
 *   3. 1 行ずつ読み取りながら認証ログを集計
 *   4. 集計結果とパフォーマンス情報を出力
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('使用法: node log_summary.ts <logfile.gz>');
    process.exit(EXIT_USAGE);
  }

  const logFilePath = args[0];

  // 実行開始時点の高精度な時刻を取得します（処理時間の計測用）。
  const startHrTime = process.hrtime();

  // 集計結果を保持するための Map を初期化します。
  const userStats = new Map<string, UserStats>(); // ユーザー単位の統計
  const ipStats = new Map<string, number>();      // IP アドレス単位の失敗回数
  let totalFailures = 0;                          // 認証失敗の総数

  try {
    // gzip 圧縮ログファイルをストリーミングで開きます。
    const fileStream = fs.createReadStream(logFilePath);

    // ファイルオープン・読み込み中のエラー（ファイル不存在、権限不足など）を補足します。
    fileStream.on('error', (err) => {
      console.error('ファイル読み込みエラー:', err);
      process.exit(EXIT_FILE_ERROR);
    });

    // gzip 解凍ストリームを作成します。
    const gunzip = zlib.createGunzip();

    // gzip 展開時のエラー（壊れた gzip など）を補足します。
    gunzip.on('error', (err) => {
      console.error('gzip 展開エラー:', err);
      process.exit(EXIT_GZIP_ERROR);
    });

    // readline を用いて「解凍済みのテキスト」を 1 行ずつ読み取ります。
    const rl = readline.createInterface({
      input: fileStream.pipe(gunzip),
      crlfDelay: Infinity, // CRLF と LF のどちらも改行として扱います。
    });

    // REVIEW: good readlineをfor awaitで回していて読みやすい
    // for-await-of により、非同期に 1 行ずつ処理します。
    for await (const line of rl) {
      const match = line.match(SYSLOG_LINE_REGEX);
      if (!match) {
        // syslog の形式とみなせない行は、要件どおりスキップします（エラーにはしません）。
        continue;
      }

      // match 配列から必要な情報のみ取り出します。
      const [, , , processName, , message] = match;

      // sshd 以外のプロセスのログは集計対象外です。
      if (processName !== 'sshd') continue;

      // sshd のメッセージ部分を解析し、該当する認証ログであれば統計情報を更新します。
      // REVIEW: suggest このコールバック関数はループの外で定義した方が良い
      parseMessage(message, userStats, ipStats, () => {
        totalFailures++;
      });
    }

    // ログ集計結果を出力します。
    printResults(userStats, ipStats, totalFailures);

    // 実行時間と最大メモリ使用量を出力します。
    printPerformance(startHrTime);
  } catch (err) {
    // try ブロック内で同期的に発生した例外を補足します。
    // （ストリームのエラーはそれぞれの on('error') で処理されます）
    console.error('ファイル処理エラー:', err);
    process.exit(EXIT_PROCESSING_ERROR);
  }
}

// ============================================================================
//  ログ解析・集計関連
// ============================================================================

/**
 * sshd のメッセージ部分を解析し、
 * 認証成功・失敗ごとの統計情報を更新します。
 *
 * 対象となるメッセージは以下の 4 パターンです:
 *   - Accepted publickey for USER from IP ...
 *   - Accepted password  for USER from IP ...
 *   - Failed   password  for USER from IP ...
 *   - Failed   password  for invalid user USER from IP ...
 */
function parseMessage(
  message: string,
  userStats: Map<string, UserStats>,
  ipStats: Map<string, number>,
  incrementTotalFailures: () => void,
) {
  // まず「認証成功」メッセージかどうかをチェックします。
  let match = message.match(ACCEPTED_REGEX);
  if (match) {
    const [, method, user] = match;
    // IP 情報 (match[3]) は現時点の要件では使用しないため読み飛ばしています。
    updateStats(userStats, user, method, true);
    return;
  }

  // 次に「認証失敗」メッセージかどうかをチェックします。
  match = message.match(FAILED_REGEX);
  if (match) {
    const [, method, user, ip] = match;
    updateStats(userStats, user, method, false);
    updateIpStats(ipStats, ip);
    incrementTotalFailures();
    return;
  }

  // 上記どちらにも当てはまらない sshd ログ（接続確立、切断など）は集計対象外として無視します。
}

/**
 * ユーザー + 認証方式ごとの統計情報を更新します。
 *
 * @param userStats ユーザーごとの統計情報を保持する Map
 * @param user      ユーザー名
 * @param method    認証方式（例: publickey, password）
 * @param isSuccess 認証成功であれば true、失敗であれば false
 */
function updateStats(
  userStats: Map<string, UserStats>,
  user: string,
  method: string,
  isSuccess: boolean,
) {
  // 対象ユーザーのエントリがなければ作成します。
  if (!userStats.has(user)) {
    userStats.set(user, { methods: new Map() });
  }
  const userStat = userStats.get(user)!;

  // 対象認証方式のエントリがなければ作成します。
  if (!userStat.methods.has(method)) {
    userStat.methods.set(method, { success: 0, failure: 0 });
  }
  const methodStat = userStat.methods.get(method)!;

  // 成功／失敗の件数をそれぞれカウントアップします。
  if (isSuccess) {
    methodStat.success++;
  } else {
    methodStat.failure++;
  }
}

/**
 * IP アドレスごとの認証失敗回数を 1 件分加算する。
 *
 * @param ipStats IP アドレスごとの失敗回数を保持する Map
 * @param ip      失敗元の IP アドレス
 */
function updateIpStats(ipStats: Map<string, number>, ip: string) {
  const count = ipStats.get(ip) ?? 0;
  ipStats.set(ip, count + 1);
}

// ============================================================================
//  出力関連
// ============================================================================

/**
 * 集計結果（成功・失敗・IP 別）を整形して標準出力に出力します。
 *
 * 表示仕様は要件に合わせており、ソート順は以下の通りです:
 *   - 成功／失敗: 件数降順 → ユーザー名昇順 → 認証方式昇順
 *   - IP 別     : 件数降順 → IP 昇順
 */
function printResults(
  userStats: Map<string, UserStats>,
  ipStats: Map<string, number>,
  totalFailures: number,
) {
  // ------------------------------------------------------------------------
  // 1. 認証成功数（全件）
  // ------------------------------------------------------------------------
  const successList: { user: string; method: string; count: number }[] = [];
  for (const [user, stat] of userStats) {
    for (const [method, mStat] of stat.methods) {
      if (mStat.success > 0) {
        successList.push({ user, method, count: mStat.success });
      }
    }
  }

  // ソート: 成功数 降順 → ユーザー名 昇順 → 認証方式 昇順
  successList.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.user !== b.user) return a.user.localeCompare(b.user);
    return a.method.localeCompare(b.method);
  });

  const successRows = successList.map((e) => [
    e.user,
    e.method,
    e.count.toString(),
  ]);

  printTableStyle(
    'Authentication successes (all):',
    ['User', 'Method', 'Success'],
    successRows,
    '(no authentication successes found)',
  );

  // ------------------------------------------------------------------------
  // 2. 認証失敗数（ユーザー + 認証方式、上位 10 件）
  // ------------------------------------------------------------------------
  const failureList: { user: string; method: string; count: number }[] = [];
  for (const [user, stat] of userStats) {
    for (const [method, mStat] of stat.methods) {
      if (mStat.failure > 0) {
        failureList.push({ user, method, count: mStat.failure });
      }
    }
  }

  // ソート: 失敗数 降順 → ユーザー名 昇順 → 認証方式 昇順
  failureList.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.user !== b.user) return a.user.localeCompare(b.user);
    return a.method.localeCompare(b.method);
  });

  // 上位の10位を取得
  const topFailures = failureList.slice(0, 10);
  const failureRows = topFailures.map((e) => [
    e.user,
    e.method,
    e.count.toString(),
  ]);

  printTableStyle(
    'Authentication failures (top 10):',
    ['User', 'Method', 'Failure'],
    failureRows,
    '(no authentication failures found)',
  );

  console.log(`Total authentication failures: ${totalFailures}`);
  console.log('');

  // ------------------------------------------------------------------------
  // 3. IP ごとの認証失敗数（上位 10 件）
  // ------------------------------------------------------------------------

  const ipList: { ip: string; count: number }[] = [];
  for (const [ip, count] of ipStats) {
    ipList.push({ ip, count });
  }

  // ソート: 失敗数 降順 → IP 昇順
  ipList.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.ip.localeCompare(b.ip);
  });

  // 上位の10位を取得
  const topIps = ipList.slice(0, 10);
  const ipRows = topIps.map((e) => [
    e.ip,
    e.count.toString(),
  ]);

  printTableStyle(
    'Authentication failures by IP (top 10):',
    ['IP', 'Failure'],
    ipRows,
    '(no authentication failures by IP)',
  );
}

/**
 *  テーブルのような形で出力関数です。
 *
 * - 各列の幅は「ヘッダと全行の中で最も長い文字列」に合わせます。
 * - すべて左寄せで表示します（文字列・数字ともに左寄せ）。
 * - rows が空の場合は、emptyMessage で渡されたメッセージだけを表示する。
 */
function printTableStyle(
  title: string,
  headers: string[],
  rows: string[][],
  emptyMessage: string,
): void {
  console.log(title);

  if (rows.length === 0) {
    console.log(`  ${emptyMessage}`);
    console.log('');
    return;
  }

  // 各列の最大幅を計算
  const widths = headers.map((header, i) =>
    Math.max(
      header.length,
      ...rows.map((row) => (row[i] ?? '').length),
    ),
  );

  // ヘッダ行
  console.log(
    '  ' +
      headers
        .map((h, i) => h.padEnd(widths[i]))
        .join('  '),
  );

  // 区切り線
  console.log(
    '  ' +
      widths
        .map((w) => '-'.repeat(w))
        .join('  '),
  );

  // データ行
  for (const row of rows) {
    console.log(
      '  ' +
        row
          .map((cell, i) => (cell ?? '').padEnd(widths[i]))
          .join('  '),
    );
  }

  console.log('');
}


/**
 * 実行時間と最大メモリ使用量を計測して出力します。
 *
 * time:
 *   process.hrtime で取得した開始時刻との差分を用い、
 *   ミリ秒単位に丸めて表示します。
 *
 * rss:
 *   process.resourceUsage().maxRSS を使用し、
 *   KB 単位の値を MiB 単位に変換して表示します。
 */
function printPerformance(startHrTime: [number, number]) {
  const diff = process.hrtime(startHrTime);
  const timeMs = Math.round(diff[0] * 1000 + diff[1] / 1e6);

  const usage = process.resourceUsage();
  const rssMiB = Math.round(usage.maxRSS / 1024);

  console.log(`Performance: time=${timeMs}ms rss=${rssMiB}MiB`);
}

// プログラムを実行します。
main();
