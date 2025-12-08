#!/usr/bin/env node
// Node.js で直接実行できるようにシバンを追加
'use strict'; // 厳格モードを有効化（意図しないグローバル変数などを防ぐ）

// =============================
// モジュールのインポート
// =============================
import fs from 'fs'; // ファイル操作用モジュール
import { UsageError, handleAppError } from './lib/error.ts'; // エラー処理用モジュール
import { 
    printAuthSuccesses,
    printAuthFailures,
    printAuthFailuresByIp 
} from './services/auth_stats.ts'; // 認証結果集計の表示関数群
import { processLogFile } from './services/log_processor.ts'; // ログファイル処理のコア関数
import type { Stats } from './services/auth_stats.ts'; // 集計データ型
import { printPerformance } from './lib/util.ts'; // パフォーマンス計測表示用関数

// =============================
// メイン処理
// =============================
async function main(): Promise<void> {
    // 処理開始時刻をナノ秒単位で取得
    const startTimeNs = process.hrtime.bigint();

    try {
        // -----------------------------
        // コマンドライン引数の処理
        // -----------------------------
        const args = process.argv.slice(2); // node コマンド直後の引数を取得
        if (args.length !== 1) {
            // 引数が1つでない場合は使用方法エラー
            throw new UsageError('Usage: node log_summary.ts <logfile.gz>');
        }

        // -----------------------------
        // 入力ファイルの存在確認
        // -----------------------------
        const logFile = args[0];
        if (!fs.existsSync(logFile)) {
            throw new UsageError(`Input file not found: ${logFile}`);
        }

        // -----------------------------
        // 統計情報オブジェクトの初期化
        // -----------------------------
        // 集計対象のデータを保持するオブジェクト
        // 各キーにユーザー名・IP・メソッドごとのカウントを格納
        const stats: Stats = {
            successCounts: {},             // 成功した認証のカウント
            failureCountsUserMethod: {},  // ユーザー+認証方式ごとの失敗カウント
            failureCountsByIp: {},         // IPごとの失敗カウント
            totalFailures: 0,              // 全体の失敗数
        };

        // -----------------------------
        // ログファイルの処理
        // -----------------------------
        // 実際のログ解析は別モジュールで処理
        // stats オブジェクトに結果が反映される
        await processLogFile(logFile, stats);

        // -----------------------------
        // 集計結果の表示
        // -----------------------------
        printAuthSuccesses(stats); // 成功した認証を表示
        console.log();             // 見やすさのため空行
        printAuthFailures(stats);  // 失敗した認証を表示
        console.log();
        printAuthFailuresByIp(stats); // IPごとの失敗集計を表示
        console.log();

        // -----------------------------
        // パフォーマンス計測結果の表示
        // -----------------------------
        printPerformance(startTimeNs); // 処理時間などを表示
    } catch (err: any) {
        // エラー発生時の共通処理
        handleAppError(err);
    }
}

// =============================
// スクリプト実行
// =============================
main();
