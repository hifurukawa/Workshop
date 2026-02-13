export const ExitCode = {
  OK: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  AUTH_ERROR: 3,
  IO_DB_ERROR: 4,
} as const;

/**
 * exitWith
 *  - message があれば同期的に出力
 *  - code が 0 以外の場合は stderr
 *  - throw で main catch に投げる
 */
export function exitWith(code: number, message?: string): never {
  if (message) {
    const text = message.endsWith('\n') ? message : message + '\n';
    if (code === ExitCode.OK) {
      process.stdout.write(text);
    } else {
      process.stderr.write(text);
    }
  }

  // throw で main に exit 処理を委譲
  throw { code };
}