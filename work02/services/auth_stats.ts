/**
 * =============================
 * 認証ログ集計モジュール
 * ============================
 * - 認証成功・失敗の集計と表示を行うユーティリティ関数群
 * 
 * NOTE:
 * パフォーマンスに関する考慮点
 * - 集計用オブジェクト Stats　はMapよりもシンプルな構造にして高速アクセスを優先
 * - 上位N件抽出には min-heap と全件ソートの2通りを実装。大差はなし。
 */

import type { AuthInfo } from '../lib/parse_auth_line.ts';
import { padRight, splitUserMethodKey, getTopN } from '../lib/util.ts';

// =============================
// 統計オブジェクトの型定義
// =============================
export interface Stats {
    successCounts: { [key: string]: number };        // key: "user\tmethod" → 成功カウント
    failureCountsUserMethod: { [key: string]: number }; // key: "user\tmethod" → 失敗カウント
    failureCountsByIp: { [ip: string]: number };     // IPごとの失敗カウント
    totalFailures: number;                           // 総失敗数
}

// =============================
// 集計ユーティリティ関数
// =============================

/**
 * オブジェクト内のカウンタを1増加
 * - キーが存在しなければ初期値0からスタート
 */
export function incrementMap(map: { [key: string]: number }, key: string): void {
    map[key] = (map[key] || 0) + 1;
}

/**
 * "user\tmethod" 形式で集計用キーを作成
 */
export function makeUserMethodKey(user: string, method: string): string {
    return `${user}\t${method}`;
}

/**
 * Stats を更新する
 * - info.result に応じて successCounts / failureCountsUserMethod を更新
 * - 失敗時は totalFailures と failureCountsByIp も更新
 */
export function updateStats(stats: Stats, info: AuthInfo): void {
    const key = makeUserMethodKey(info.user, info.method);

    if (info.result === 'success') {
        incrementMap(stats.successCounts, key);
    } else {
        incrementMap(stats.failureCountsUserMethod, key);
        stats.totalFailures += 1;

        if (info.ip) {
            incrementMap(stats.failureCountsByIp, info.ip);
        }
    }
}

// =============================
// 集計結果表示関数
// =============================

/**
 * 認証成功の集計結果を表示（全件）
 */
export function printAuthSuccesses(stats: Stats): void {
    type Row = { user: string; method: string; count: number };
    const rows: Row[] = [];

    // key から user/method を分解して行リスト作成
    for (const key in stats.successCounts) {
        const count = stats.successCounts[key];
        const { user, method } = splitUserMethodKey(key);
        rows.push({ user, method, count });
    }

    // ソート: 成功数降順 → ユーザー昇順 → メソッド昇順
    rows.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        if (a.user !== b.user) return a.user.localeCompare(b.user);
        return a.method.localeCompare(b.method);
    });

    // 表示
    console.log('Authentication successes (all):');
    console.log('  User       Method      Success');
    console.log('  ------------------------------');
    for (const row of rows) {
        console.log(`  ${padRight(row.user, 10)} ${padRight(row.method, 10)} ${row.count}`);
    }
}

/**
 * 認証失敗の集計結果を表示（上位10件）
 */
export function printAuthFailures(stats: Stats): void {
    type Row = { user: string; method: string; count: number };
    const rows: Row[] = [];

    for (const key in stats.failureCountsUserMethod) {
        const count = stats.failureCountsUserMethod[key];
        const { user, method } = splitUserMethodKey(key);
        rows.push({ user, method, count });
    }

    // ソートして上位10件を抽出
    // rows.sort((a, b) => {
    //     if (b.count !== a.count) return b.count - a.count;
    //     if (a.user !== b.user) return a.user.localeCompare(b.user);
    //     return a.method.localeCompare(b.method);
    // });
    // const top10 = rows.slice(0, 10);

    // ==================================================
    // NOTE : min-heap を使った 上位10件 抽出
    const top10 = getTopN(rows, 10, (a, b) => {
        if (a.count !== b.count) return a.count - b.count;
        if (a.user !== b.user) return a.user.localeCompare(b.user);
        return a.method.localeCompare(b.method);
    });
    // ======================================================

    console.log('Authentication failures (top 10):');
    console.log('  User       Method      Failure');
    console.log('  ------------------------------');
    for (const row of top10) {
        console.log(`  ${padRight(row.user, 10)} ${padRight(row.method, 10)} ${row.count}`);
    }

    console.log();
    console.log(`Total authentication failures: ${stats.totalFailures}`);
}

/**
 * IPごとの認証失敗数を表示（上位10件）
 */
export function printAuthFailuresByIp(stats: Stats): void {
    type Row = { ip: string; count: number };
    const rows: Row[] = [];

    for (const ip in stats.failureCountsByIp) {
        rows.push({ ip, count: stats.failureCountsByIp[ip] });
    }

    // ソートして上位10件抽出
    // rows.sort((a, b) => {
    //     if (b.count !== a.count) return b.count - a.count;
    //     return a.ip.localeCompare(b.ip);
    // });
    // const top10 = rows.slice(0, 10);

    // ==================================================
    // NOTE: min-heap を使った 上位10件 抽出
    const top10 = getTopN(rows, 10, (a, b) => {
        if (a.count !== b.count) return a.count - b.count;
        return a.ip.localeCompare(b.ip);
    });
    // =====================================================

    console.log('Authentication failures by IP (top 10):');
    console.log('  IP                 Failure');
    console.log('  -------------------------');
    for (const row of top10) {
        console.log(`  ${padRight(row.ip, 18)} ${row.count}`);
    }
}
