// src/dbState.mts
import fs from 'node:fs';
import { openDb } from './db.mts';
import { DB_PATH } from './config.mts';
import { exitWith, ExitCode } from './exitHandler.mts';

/**
 * DB状態定義
 */
export const DbState = {
  NO_DB: 'NO_DB',
  UNINITIALIZED: 'UNINITIALIZED',
  READY: 'READY',
  CORRUPTED: 'CORRUPTED'
} as const;

export type DbState = (typeof DbState)[keyof typeof DbState];

/**
 * テーブルの存在確認
 * @param name 
 * @returns 
 */
function tableExists(name: string): boolean {
  const db = openDb();
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`
  ).get(name);
  return !!row;
}

/**
 * DBの状態を確認する
 * @returns 
 */
export function checkDbState(): DbState {
  // 1. DBファイル存在確認
  if (!fs.existsSync(DB_PATH)) {
    return DbState.NO_DB;
  }

  const db = openDb();

  // 2. integrity_check
  try {
    const row = db
      .prepare(`PRAGMA integrity_check;`)
      .get() as { integrity_check: string };

    if (!row || row.integrity_check !== 'ok') {
      return DbState.CORRUPTED;
    }
  } catch {
    return DbState.CORRUPTED;
  }

  const hasMaster = tableExists('master');
  const hasCredentials = tableExists('credentials');

  // 3. 両方テーブル無し
  if (!hasMaster && !hasCredentials) {
    return DbState.UNINITIALIZED;
  }

  // 4. 片方だけ存在 → 異常
  if (hasMaster !== hasCredentials) {
    return DbState.CORRUPTED;
  }

  // 5. masterレコード数確認
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM master;`)
    .get() as { count: number };

  if (row.count === 0) return DbState.UNINITIALIZED;
  if (row.count === 1) return DbState.READY;

  return DbState.CORRUPTED;
}

/**
 * DBが使用可能な状態か確認する
 */
export function requireReadyState(): void {
  const state = checkDbState();

  if (state === DbState.NO_DB || state === DbState.UNINITIALIZED) {
    exitWith(ExitCode.IO_DB_ERROR, 'Database not initialized.');
  }

  if (state === DbState.CORRUPTED) {
    exitWith(ExitCode.IO_DB_ERROR, 'Database corrupted.');
  }

  // READY のみ通過
}