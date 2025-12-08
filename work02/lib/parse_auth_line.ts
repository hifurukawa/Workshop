/**
 * =============================
 * SSH認証ログ解析モジュール
 * =============================
 */


// SSH認証で利用されるメソッドの種類
export type AuthMethod = 'publickey' | 'password';

// 認証結果の種別
export type AuthResult = 'success' | 'failure';

// 1行の認証ログから抽出される情報
export interface AuthInfo {
    result: AuthResult;  // 認証結果（成功 or 失敗）
    user: string;        // 認証対象のユーザー名
    method: AuthMethod;  // 認証方式
    ip?: string;         // 失敗時は IP 集計に利用（成功時も可）
}

// =============================
// 正規表現パターン
// =============================

// Accepted / Failed のログをまとめてマッチさせる正規表現
// match 配列のインデックスと意味:
// match[1] = Accepted の場合のメソッド (publickey/password)
// match[2] = Accepted の場合のユーザー名
// match[3] = Accepted の場合の IP
// match[4] = Failed の場合のユーザー名
// match[5] = Failed の場合の IP
const AUTH_REGEX =
    /sshd(?:\[\d+\])?:\s+(?:Accepted (publickey|password) for (\S+) from (\S+)|Failed password for (?:invalid user )?(\S+) from (\S+))/


// =============================
// 1行ログパース関数
// =============================

/**
 * 1行の sshd 認証ログから AuthInfo を抽出
 *
 * 対象フォーマット:
 *   Accepted publickey for USER from IP ...
 *   Accepted password for USER from IP ...
 *   Failed  password for USER from IP ...
 *   Failed  password for invalid user USER from IP ...
 *
 * - sshd ログ以外は null を返す
 * - フォーマット不一致も null を返す
 */
export function parseAuthLine(line: string): AuthInfo | null {
    // sshd に関するログでなければ早期リターン
    if (!line.includes('sshd')) {
        return null;
    }

    // 成功/失敗をまとめて1回でマッチ
    // NOTE: 2回に分けるより1回の方が高速（0.08秒ほど改善）
    const match = AUTH_REGEX.exec(line);

    if (!match) return null; // マッチしなければ null

    // -----------------------------
    // 成功ログの解析
    // -----------------------------
    if (match[1]) {
        return {
            result: 'success',       // 認証成功
            user: match[2],          // ユーザー名
            method: match[1] as AuthMethod, // 認証方式
            ip: match[3],            // IPアドレス
        };
    }

    // -----------------------------
    // 失敗ログの解析
    // -----------------------------
    if (match[4]) {
        return {
            result: 'failure',       // 認証失敗
            user: match[4],          // ユーザー名
            method: 'password',      // 失敗は password 固定
            ip: match[5],            // IPアドレス
        };
    }

    // 想定外のパターンは null
    return null;
}
