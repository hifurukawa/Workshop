import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

/**
 * ========================
 * 定数・パス設定
 * ========================
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DB_FILE = 'pwman.db';
export const DB_PATH = process.env.PWMAN_DB_PATH ?? 'pwman.db'

export const ARGS = process.argv.slice(2);
export const COMMAND = ARGS[0];