import crypto from 'node:crypto';

const ITERATIONS = 100_000;
const KEY_LEN = 32; // 256bit
const DIGEST = 'sha256';


/**
 * master password から暗号鍵を導出
 * @param masterPw 
 * @param salt 
 * @returns 
 */
export function deriveKey(masterPw: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(masterPw, salt, ITERATIONS, KEY_LEN, DIGEST);
}


/**
 * 鍵から保存用ハッシュを生成
 * @param key 
 * @returns 
 */
export function hashDerivedKey(key: Buffer): string {
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');
}


/**
 * 平文を暗号化（AES-256-GCM）
 * @param plain 
 * @param key 
 * @returns 
 */
export function encrypt(plain: string, key: Buffer): string {
  // =========================
  // 通常暗号処理
  // =========================
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * 暗号文を復号
 * @param cipherText 
 * @param key 
 * @returns 
 */
export function decrypt(cipherText: string, key: Buffer): string {
  const data = Buffer.from(cipherText, 'base64');

  /**
   * memo::
   * - AES-GCMでは、暗号化されたデータに加えて
   * 初期化ベクトル(IV)と認証タグが必要
   * - 初期化ベクトル（initialization vector, IV）とは
   *   暗号化プロセスの開始時に使用されるランダムな値
   * 　→同じ平文と鍵を使用しても、異なるIVを使用することで異なる暗号文が生成される
   *   ※ここでいう「ベクトル」は数学的な意味のベクトルではなく、単に「ビット列」を指す
   *   ※初期化とは、暗号化プロセスの開始時に使用されることを意味する
   * 
   * - 認証タグ(authentication tag)とは
   *   データの整合性と認証を保証するために使用される値
   * 　→データが改ざんされていないことを確認するために使用される
   *   tag = f(鍵, iv, 暗号化データ) で生成され,
   *   復号時に同じ関数で再計算されたtagと比較される。
   * 　
   */
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  /**
   * memo::subarray() とslice() の違い
   * - subarray() とslice()はどちらも型付き配列（要素の型が統一された配列）の一部を取得するメソッド
   * - slice()は元の配列のコピーを作成する
   * 　→元の配列に影響を与えない
   * - subarray() は元の配列と同じメモリ領域を参照し、範囲を指定して新しいビュー(「データの窓」)を作成する
   * 　→元の配列に影響を与える
   * 
   * ここでは、iv, tag, encrypted は
   * 元の data バッファの一部を参照するだけでよいので
   * subarray() を使用している。
   * つまり、攻撃者が data バッファを書き換えると
   * iv, tag, encrypted の内容も変わり、復号に失敗する。
   */

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return plain.toString('utf8');
}