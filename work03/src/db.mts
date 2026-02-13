import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.mts';
import { exitWith, ExitCode } from './exitHandler.mts';
import { Messages } from './messages.mts';

/**
 * ========================
 * SQLite DB
 * ========================
 */
let dbInstance: DatabaseSync | null = null;
export function openDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
  }
  return dbInstance;
}

/**
 * DBファイルの存在を確認する
 */
export function ensureDbExists(): void {
  if (!fs.existsSync(DB_PATH)) {
    exitWith(ExitCode.IO_DB_ERROR, Messages.errors.dbNotInitialized);
  }
}


/**
 * ========================
 * DB スキーマ
 * ========================
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS credentials (
  service TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  PRIMARY KEY (service, username)
);

CREATE TABLE IF NOT EXISTS master (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL
);
`;