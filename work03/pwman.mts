// pwman.mts
import { COMMAND } from './src/config.mts';
import { openDb, ensureDbExists, SCHEMA_SQL } from './src/db.mts';
import { requireReadyState, checkDbState, DbState } from './src/dbState.mts';
import {
  verifyMasterPassword,
  getMasterPassword,
  askNewMasterWithConfirm,
  getMasterSalt
} from './src/master.mts';
import { validateNoControlChars, getOption, askPassword, askChoice } from './src/utils.mts';
import { deriveKey, encrypt, decrypt, hashDerivedKey } from './src/credentialCrypto.mts';
import {
  parseCsvFileStrict,
  validateExportTargetPath,
  buildCsv,
  suggestNonConflictingPath
} from './src/csvSpec.mts';
import { exitWith, ExitCode } from './src/exitHandler.mts';
import { Messages } from './src/messages.mts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';


/**
 * ========================
 * コマンド実装
 * ========================
 */

/**
 * ========================
 * init
 * ========================
 */
async function cmdInit(args: string[]): Promise<void> {
  if (!(args.length === 1 || (args.length === 3 && args[1] === '--master'))) {
    exitWith(ExitCode.USAGE_ERROR, Messages.usage.init);
  }

  const state = checkDbState();

  if (state === DbState.READY) {
    exitWith(ExitCode.GENERAL_ERROR, Messages.errors.dbAlreadyInitialized);
  }

  if (state === DbState.CORRUPTED) {
    exitWith(ExitCode.IO_DB_ERROR, 'Database corrupted.');
  }

  // NO_DB or UNINITIALIZED のみ許可

  const masterPw =
    args.length === 3 ? args[2] : await askNewMasterWithConfirm();

  if (!masterPw) {
    exitWith(ExitCode.USAGE_ERROR, Messages.errors.emptyPassword);
  }

  const db = openDb();

  try {
    db.exec('BEGIN');

    db.exec(SCHEMA_SQL);

    const salt = crypto.randomBytes(16).toString('hex');
    const key = deriveKey(masterPw, salt);
    const hash = hashDerivedKey(key);

    db.prepare(
      `INSERT INTO master (id, password_hash, salt) VALUES (1, ?, ?)`
    ).run(hash, salt);

    db.exec('COMMIT');

  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  exitWith(ExitCode.OK, Messages.infos.dbInitialized);
}


/* ========================
 * add
 * ========================
 */
async function cmdAdd(args: string[]): Promise<void> {
  if (!(args.length === 4 || args.length === 6)) {
    exitWith(ExitCode.USAGE_ERROR, Messages.usage.add);
  }

  requireReadyState();

  const [_, service, username, password] = args;
  const masterPw = await getMasterPassword(args, 4);

  validateNoControlChars(service, username, password);

  const db = openDb();

  if (!verifyMasterPassword(masterPw, db)) {
    exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);
  }

  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);
  const encrypted = encrypt(password, key);

  try {
    db.exec('BEGIN');

    db.prepare(
      `INSERT INTO credentials (service, username, password) VALUES (?, ?, ?)`
    ).run(service, username, encrypted);

    db.exec('COMMIT');

  } catch (e: any) {
    try { db.exec('ROLLBACK'); } catch {}

    if (e?.message?.includes('UNIQUE constraint failed')) {
      exitWith(ExitCode.GENERAL_ERROR, `Entry already exists: ${service} ${username}`);
    }

    exitWith(ExitCode.IO_DB_ERROR, Messages.errors.ioError);
  }

  exitWith(ExitCode.OK, `Added: ${service} ${username}`);
}



/**
 * ========================
 * get
 * ========================
 */
async function cmdGet(args: string[]): Promise<void> {
  if (args.length < 3) exitWith(ExitCode.USAGE_ERROR, Messages.usage.get);

  requireReadyState();
  const [_, service, username] = args;
  const masterPw = await getMasterPassword(args, 3);

  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);

  const row = db.prepare(`SELECT password FROM credentials WHERE service=? AND username=?`).get(service, username) as { password: string } | undefined;
  if (!row) exitWith(ExitCode.GENERAL_ERROR, Messages.errors.entryNotFound);

  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);
  const decrypted = decrypt(row.password, key);

  exitWith(ExitCode.OK, `${service}, ${username}, ${decrypted}`);
}

/**
 * ========================
 * del
 * ========================
 */
async function cmdDel(args: string[]): Promise<void> {
  if (args.length < 3) {
    exitWith(ExitCode.USAGE_ERROR, Messages.usage.del);
  }

  requireReadyState();

  const [_, service, username] = args;
  const masterPw = await getMasterPassword(args, 3);

  const db = openDb();

  if (!verifyMasterPassword(masterPw, db)) {
    exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);
  }

  try {
    db.exec('BEGIN');

    const res = db.prepare(
      `DELETE FROM credentials WHERE service=? AND username=?`
    ).run(service, username);

    if (res.changes === 0) {
      db.exec('ROLLBACK');
      exitWith(ExitCode.GENERAL_ERROR, Messages.errors.entryNotFound);
    }

    db.exec('COMMIT');

  } catch (e: any) {
    try { db.exec('ROLLBACK'); } catch {}
    exitWith(ExitCode.IO_DB_ERROR, `Error accessing DB: ${e?.message ?? String(e)}`);
  }

  exitWith(ExitCode.OK, Messages.infos.entryDeleted);
}


/**
 * ========================
 * list
 * ========================
 */
async function cmdList(args: string[]): Promise<void> {
  if (!(args.length === 1 || args.length === 3)) exitWith(ExitCode.USAGE_ERROR, Messages.usage.list);

  requireReadyState();
  let orderBy = 'service';
  let order = 'ASC';

  if (args.length === 3) {
    const [flag, column] = [args[1], args[2]];
    if (!['--asc', '--desc'].includes(flag) || !['service', 'username'].includes(column)) {
      exitWith(ExitCode.USAGE_ERROR, Messages.usage.list);
    }
    order = flag === '--desc' ? 'DESC' : 'ASC';
    orderBy = column;
  }

  const db = openDb();
  const rows = db.prepare(`SELECT service, username FROM credentials ORDER BY ${orderBy} ${order}`)
                 .all() as { service: string; username: string }[];

  if (rows.length === 0) {
    exitWith(ExitCode.OK, Messages.infos.NoData);
  } else {
    rows.forEach(r => console.log(`${r.service} ${r.username}`));
  }

  exitWith(ExitCode.OK);
}


/**
 * ========================
 * status
 * ========================
 */
async function cmdStatus(args: string[]): Promise<void> {
  if (args.length !== 1) exitWith(ExitCode.USAGE_ERROR, Messages.usage.status);

  ensureDbExists();

  let db;
  try {
    db = openDb();
    const row = db.prepare(`SELECT COUNT(*) AS count FROM credentials`).get() as { count: number };

    console.log(Messages.infos.initializedYes);
    console.log(`Entries: ${row.count}`);
  } catch (e: any) {
    exitWith(ExitCode.IO_DB_ERROR, `Error accessing DB: ${e?.message ?? String(e)}`);
  }

  exitWith(ExitCode.OK);
}


/**
 * ========================
 * export
 * ========================
 */
async function cmdExport(args: string[]): Promise<void> {
  if (!(args.length === 2 || args.length === 4)) {
    exitWith(ExitCode.USAGE_ERROR, Messages.usage.export);
  }

  requireReadyState();

  const requestedPath = args[1];
  validateExportTargetPath(requestedPath); // .csv拡張子・パス検証

  // 同名ファイルがある場合の選択
  let csvPath = requestedPath;
  if (fs.existsSync(csvPath)) {
    const choice = await askChoice(
      Messages.prompts.confirmExportConflict(csvPath),
      ['o', 'r', 'c']
    );

    if (choice === 'c') {
      exitWith(ExitCode.OK, Messages.infos.exportCanceled);
    }

    if (choice === 'r') {
      csvPath = suggestNonConflictingPath(requestedPath);
      // 採番後のパスもチェック（.csvやディレクトリなど）
      validateExportTargetPath(csvPath);
      console.log(Messages.infos.exportRenamedTo(csvPath));
    }

    // choice === 'o' はそのまま上書き（後続のrenameで置き換わる）
  }
  const tmpPath = csvPath + '.tmp';

  const masterPw = await getMasterPassword(args, 2);
  const db = openDb();

  if (!verifyMasterPassword(masterPw, db)) {
    exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);
  }

  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);

  const rows = db.prepare(
    `SELECT service, username, password FROM credentials`
  ).all() as { service: string; username: string; password: string }[];

  // csvSpec.mts の仕様でCSV生成
  const csv = buildCsv(
    rows.map(r => ({
      service: r.service,
      username: r.username,
      password: decrypt(r.password, key)
    }))
  );

  fs.writeFileSync(tmpPath, csv);
  fs.renameSync(tmpPath, csvPath);

  exitWith(ExitCode.OK, `Success: Exported to ${csvPath}`);
}

/**
 * ========================
 * import
 * ========================
 */
async function cmdImport(args: string[]): Promise<void> {
  if (!(args.length === 2 || args.length === 4)) {
    exitWith(ExitCode.USAGE_ERROR, Messages.usage.import);
  }

  requireReadyState();

  const filePath = args[1];

  const masterPw = await getMasterPassword(args, 2);
  const db = openDb();

  // マスターパスワード検証
  if (!verifyMasterPassword(masterPw, db)) {
    exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);
  }

  // CSVを厳密に読む
  const records = parseCsvFileStrict(filePath);


  // 既存データがあるなら確認（続行 or キャンセル）
  const existingCount = db
    .prepare(`SELECT COUNT(*) AS cnt FROM credentials`)
    .get() as { cnt: number };

  if (existingCount.cnt > 0) {
    const choice = await askChoice(
      Messages.prompts.confirmImportReplace(existingCount.cnt),
      ['y', 'n']
    );

    if (choice === 'n') {
      exitWith(ExitCode.OK, Messages.infos.importCanceled);
    }
  }


  // 総入れ替え（トランザクション）
  try {
    const salt = getMasterSalt(db);
    const key = deriveKey(masterPw, salt);

    db.exec('BEGIN');

    db.exec(`DELETE FROM credentials`);

    const insert = db.prepare(`INSERT INTO credentials VALUES (?, ?, ?)`);

    for (const r of records) {
      insert.run(r.service, r.username, encrypt(r.password, key));
    }

    db.exec('COMMIT');
  } catch {
    try { db.exec('ROLLBACK'); } catch {}
    exitWith(ExitCode.IO_DB_ERROR, Messages.errors.importFailed);
  }


  exitWith(ExitCode.OK, `Success: imported ${records.length} records.`);
}

/**
 * ========================
 * change-master
 * ========================
 */
async function cmdChangeMaster(args: string[]): Promise<void> {
  const allowed = new Set(['--old-master', '--new-master']);
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      if (!allowed.has(a)) {
        exitWith(ExitCode.USAGE_ERROR, Messages.usage.changeMaster);
      }
      i++;
    } else {
      exitWith(ExitCode.USAGE_ERROR, Messages.usage.changeMaster);
    }
  }

  requireReadyState();

  const oldPw =
    getOption(args, '--old-master') ??
    await askPassword(Messages.prompts.enterOldMaster);

  const newPw =
    getOption(args, '--new-master') ??
    await askNewMasterWithConfirm();

  if (oldPw === newPw) {
    exitWith(ExitCode.OK, Messages.infos.masterUnchanged);
  }

  const db = openDb();

  if (!verifyMasterPassword(oldPw, db)) {
    exitWith(ExitCode.AUTH_ERROR, Messages.errors.invalidOldMaster);
  }

  try {
    // 現在のmaster取得
    const masterRow = db.prepare(
      `SELECT password_hash, salt FROM master WHERE id=1`
    ).get() as { password_hash: string; salt: string };

    const oldKey = deriveKey(oldPw, masterRow.salt);

    // 既存資格情報をすべて復号
    const encryptedRows = db.prepare(
      `SELECT service, username, password FROM credentials`
    ).all() as { service: string; username: string; password: string }[];

    const plainRows = encryptedRows.map(r => ({
      service: r.service,
      username: r.username,
      password: decrypt(r.password, oldKey)
    }));

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newKey = deriveKey(newPw, newSalt);
    const newHash = hashDerivedKey(newKey);

    db.exec('BEGIN');

    // master更新
    db.prepare(
      `UPDATE master SET password_hash=?, salt=? WHERE id=1`
    ).run(newHash, newSalt);

    // credentials再暗号化
    db.prepare(`DELETE FROM credentials`).run();

    const insert = db.prepare(
      `INSERT INTO credentials (service, username, password) VALUES (?, ?, ?)`
    );

    for (const r of plainRows) {
      insert.run(r.service, r.username, encrypt(r.password, newKey));
    }

    db.exec('COMMIT');

  } catch {
    try { db.exec('ROLLBACK'); } catch {}
    exitWith(ExitCode.GENERAL_ERROR, Messages.errors.changeMasterFailed);
  }

  exitWith(ExitCode.OK, Messages.infos.masterChanged);
}



/**
 * ========================
 * main
 * ========================
 */
(async () => {
  try {
    const args = process.argv.slice(2);
    switch (COMMAND) {
      case 'init': await cmdInit(args); break;
      case 'add': await cmdAdd(args); break;
      case 'get': await cmdGet(args); break;
      case 'del': await cmdDel(args); break;
      case 'list': await cmdList(args); break;
      case 'status': await cmdStatus(args); break;
      case 'export': await cmdExport(args); break;
      case 'import': await cmdImport(args); break;
      case 'change-master': await cmdChangeMaster(args); break;
      case 'help': exitWith(ExitCode.OK, Messages.usage.help); break;
      default: exitWith(ExitCode.USAGE_ERROR, `Unknown command: ${COMMAND} \n` + Messages.usage.help);
    }
  } catch (err: any) {
    if (typeof err?.code === 'number') {
      process.exit(err.code);
    }

    console.error('Unexpected error:', err);
    process.exit(ExitCode.GENERAL_ERROR);
  }
})();