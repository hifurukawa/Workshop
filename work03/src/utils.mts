import process from 'node:process';
import { exitWith, ExitCode } from './exitHandler.mts';
import { Messages } from './messages.mts';


/**
 * 対話式パスワード入力
 * @param prompt 
 * @returns 
 */
export async function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(prompt);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    const onData = (char: string) => {
      switch (char) {
        case '\r':
        case '\n':
          stdout.write('\n');
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          resolve(password.trim());
          break;
        case '\u0003':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.exit(1);
        case '\u007F':
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write('\b \b');
          }
          break;
        default:
          password += char;
          stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}


/**
 * １文字選択式対話入力
 * @param prompt 
 * @param allowed 
 * @returns 
 */
export async function askChoice(prompt: string, allowed: string[]): Promise<string> {
  const allowedSet = new Set(allowed.map(x => x.toLowerCase()));

  while (true) {
    const input = await new Promise<string>((resolve) => {
      const stdin = process.stdin;
      const stdout = process.stdout;

      stdout.write(prompt);

      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      const onData = (char: string) => {
        // Enter
        if (char === '\r' || char === '\n') return;

        // Ctrl+C
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.exit(1);
        }

        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);

        stdout.write(char + '\n');
        resolve(char.trim().toLowerCase());
      };

      stdin.on('data', onData);
    });

    if (allowedSet.has(input)) return input;
  }
}


/**
 * 制御文字の検証
 * @param values 
 */
export function validateNoControlChars(...values: string[]): void {
  const CONTROL_CHAR_RE = /[\t\r\n]/;
  for (const v of values) {
    if (CONTROL_CHAR_RE.test(v)) exitWith(ExitCode.GENERAL_ERROR, Messages.errors.controlChar);
  }
}

/**
 * オプション値の取得
 * @param args 
 * @param name 
 * @returns 
 */
export function getOption(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
}