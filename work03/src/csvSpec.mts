import fs from 'node:fs';
import path from 'node:path';
import { ExitCode, exitWith } from './exitHandler.mts';
import { Messages } from './messages.mts';
import { validateNoControlChars } from './utils.mts';

/**
 * pwman が export/import で扱う CSV の仕様
 *
 * 仕様:
 * - 拡張子は .csv
 * - 文字コードは UTF-8 (BOMなし)
 * - 改行は LF(\n) のみ（CRLF不可）
 * - ヘッダは固定: service,username,password
 * - 各データ行は "3列・カンマ区切り" のみ（引用符やエスケープは扱わない）
 * - 制御文字は禁止（validateNoControlChars で検出）
 */
export const CsvSpec = {
  extension: '.csv',
  header: 'service,username,password',
  columns: 3,
  newline: '\n'
} as const;

export type CsvRecord = {
  service: string;
  username: string;
  password: string; // import時は平文。export時も平文を文字列化
};


/**
 * .csv 拡張子を要求する
 * @param filePath 
 * @param label 
 */
export function requireCsvExtension(filePath: string, label: 'export' | 'import'): void {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== CsvSpec.extension) {
    exitWith(
      ExitCode.USAGE_ERROR,
      Messages.errors.csvExtensionRequired(label, CsvSpec.extension, filePath)
    );
  }
}


/**
 *  import元ファイルの基本検証（存在・ファイルであること）
 * @param filePath 
 */
export function requireExistingFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    exitWith(ExitCode.IO_DB_ERROR,
    Messages.errors.csvImportFileNotFound(filePath));
  }
  if (fs.statSync(filePath).isDirectory()) {
    exitWith(ExitCode.USAGE_ERROR,
    Messages.errors.csvImportSourceIsDirectory(filePath));
  }
}


/**
 * export先パスの基本検証（親ディレクトリ存在、ディレクトリ指定禁止）
 * ※ export 専用
 * @param csvPath 
 */
export function validateExportTargetPath(csvPath: string): void {
  requireCsvExtension(csvPath, 'export');

  if (fs.existsSync(csvPath) && fs.statSync(csvPath).isDirectory()) {
    exitWith(ExitCode.USAGE_ERROR,
    Messages.errors.exportTargetDir);
  }

  const dir = path.dirname(csvPath);
  if (!fs.existsSync(dir)) {
    exitWith(ExitCode.IO_DB_ERROR,
    Messages.errors.exportDirNotExist(dir));
  }
}

/**
 * ファイル名採番関数
 * @param csvPath 
 * @returns 
 */
export function suggestNonConflictingPath(csvPath: string): string {
  const dir = path.dirname(csvPath);
  const ext = path.extname(csvPath); // ".csv"
  const base = path.basename(csvPath, ext); // "test"

  for (let i = 1; i <= 9999; i++) {
    const candidate = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  exitWith(ExitCode.IO_DB_ERROR, Messages.errors.csvCannotGenerateNewFileName(csvPath));
}

/**
 * pwman export と完全一致する形式の CSV 文字列を生成する
 * - LF(\n)
 * - BOMなし
 */
export function buildCsv(records: CsvRecord[]): string {
  const lines: string[] = [];
  lines.push(CsvSpec.header);

  for (const r of records) {
    // export側でも制御文字を混入させない（仕様の担保）
    validateNoControlChars(r.service, r.username, r.password);
    lines.push(`${r.service},${r.username},${r.password}`);
  }

  return lines.join(CsvSpec.newline);
}

/**
 * import: 「pwman export の形式のみ」を受け付ける
 * - UTF-8 (BOMなし)
 * - CR(\r) を含まない（CRLF禁止）
 * - ヘッダ固定
 * - 行は3列のみ
 * - 制御文字禁止
 *
 * 返り値: {service, username, password}[]（passwordは平文）
 */
export function parseCsvFileStrict(filePath: string): CsvRecord[] {
  requireCsvExtension(filePath, 'import');
  requireExistingFile(filePath);

  // まず UTF-8 として読む
  const text = fs.readFileSync(filePath, 'utf8');

  // BOM（U+FEFF）を許可しない：exportが付けないため
  if (text.charCodeAt(0) === 0xfeff) {
    exitWith(ExitCode.GENERAL_ERROR,
    Messages.errors.csvBomNotAllowed(filePath));
  }

  // exportは LF(\n) で生成するので CR(\r) があれば exportの生成ではない
  if (text.includes('\r')) {
    exitWith(
      ExitCode.GENERAL_ERROR,
      Messages.errors.csvCrlfNotAllowed(filePath));
  }

  const lines = text.split(CsvSpec.newline);

  // 空ファイルはNG
  if (lines.length === 0 || lines[0] === '') {
    exitWith(ExitCode.GENERAL_ERROR,
    Messages.errors.csvEmpty(filePath));
  }

  // ヘッダ一致（export仕様と完全一致）
  if (lines[0] !== CsvSpec.header) {
    exitWith(
      ExitCode.GENERAL_ERROR,
      Messages.errors.csvInvalidHeader(CsvSpec.header, lines[0])
    );
  }

  const records: CsvRecord[] = [];

  // 2行目以降がデータ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // 最終行の空行だけは許容
    if (line === '' && i === lines.length - 1) continue;

    // 途中の空行は不正
    if (line === '') {
      // i+1 が行番号（1始まり）
      exitWith(ExitCode.GENERAL_ERROR, Messages.errors.invalidImportLine(i + 1));
    }

    const parts = line.split(',');
    if (parts.length !== CsvSpec.columns) {
      exitWith(ExitCode.GENERAL_ERROR, Messages.errors.invalidImportFormat);
    }

    const [service, username, password] = parts;

    // 制御文字禁止
    validateNoControlChars(service, username, password);

    records.push({ service, username, password });
  }

  return records;
}