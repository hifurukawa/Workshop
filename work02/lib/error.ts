/**
 * =============================
 * エラー処理モジュール
 * =============================
 */


// =============================
// エラー定義
// =============================

// 基本のアプリケーションエラークラス
export class AppError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AppError';
    }
}

// コマンドライン引数などユーザー入力に起因するエラー
// 使用方法違反やファイル未指定などの場合に利用
export class UsageError extends AppError {
    constructor(message: string) {
        super(message);
        this.name = 'UsageError';
    }
}

// =============================
// 共通エラーハンドラ
// =============================

// アプリケーション内で発生したエラーを統一的に処理
// - UsageError: ユーザー入力の問題
// - AppError: アプリケーション内部の問題
// - その他の予期せぬ例外: 想定外のバグや例外
export function handleAppError(err: unknown): void {
    if (err instanceof UsageError) {
        // 使用方法エラーの場合はメッセージのみ表示
        console.error(err.message);
        process.exit(1); // エラーコード 1 で終了
    }

    if (err instanceof AppError) {
        // 通常のアプリケーションエラー
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }

    // 予期しない例外（未定義エラーやバグ）
    console.error('Unexpected error:', err);
    process.exit(1);
}
