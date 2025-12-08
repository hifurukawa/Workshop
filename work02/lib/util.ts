/**
 * =============================
 * 汎用ユーティリティ関数群
 * =============================



// =============================
// ユーザーと認証方式のキー操作
// =============================

/**
 * キー文字列から user と method を取り出す
 * 例: 'alice\tpassword' → { user: 'alice', method: 'password' }
 */
export function splitUserMethodKey(key: string): { user: string; method: string } {
    const [user, method] = key.split('\t'); // タブ区切りで分割
    return { user, method };
}

// =============================
// 文字列整形
// =============================

/**
 * 右パディングで文字列を揃える
 * - value の長さが length に満たない場合は空白で埋める
 * - value の長さ >= length の場合はそのまま返す
 */
export function padRight(value: string, length: number): string {
    if (value.length >= length) return value;
    return value + ' '.repeat(length - value.length);
}

// =============================
// 上位N件抽出（最小ヒープ実装）
// =============================

/**
 * topN 抽出関数
 * - items: 対象配列
 * - n: 抽出件数
 * - compare: 比較関数 (a, b) => number
 * - 返却値: 抽出された上位 n 件の配列（降順）
 *
 * NOTE:
 *  ヒープを使った上位N件抽出処理
 *  高速化を期待し実装しました。
 *  今回は全件ソートの方が高速だったため未使用です。
 */
export function getTopN<T>(items: T[], n: number, compare: (a: T, b: T) => number): T[] {
    const heap: T[] = [];

    // ヒープに要素を追加（最小ヒープ維持）
    function heapPush(item: T) {
        heap.push(item);
        let i = heap.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (compare(heap[i], heap[p]) >= 0) break;
            [heap[i], heap[p]] = [heap[p], heap[i]];
            i = p;
        }
    }

    // ヒープの先頭要素（最小値）を取り出す
    function heapPop() {
        const top = heap[0];
        const x = heap.pop()!;
        if (heap.length > 0) {
            heap[0] = x;
            let i = 0;
            while (true) {
                const l = i * 2 + 1;
                const r = i * 2 + 2;
                if (l >= heap.length) break;
                const c = r < heap.length && compare(heap[r], heap[l]) < 0 ? r : l;
                if (compare(heap[c], heap[i]) >= 0) break;
                [heap[i], heap[c]] = [heap[c], heap[i]];
                i = c;
            }
        }
        return top;
    }

    // 配列を順にヒープに投入して上位N件を維持
    for (const item of items) {
        if (heap.length < n) {
            heapPush(item);
        } else if (compare(item, heap[0]) > 0) {
            heapPop();
            heapPush(item);
        }
    }

    // ヒープから降順で結果を取り出す
    const res = [];
    while (heap.length > 0) res.push(heapPop());
    return res.reverse();
}

// =============================
// パフォーマンス計測
// =============================

/**
 * パフォーマンス計測結果を表示
 * - startTimeNs: 計測開始時刻（process.hrtime.bigint()）
 * - 出力例: Performance: time=123.456ms rss=45.67MiB
 */
export function printPerformance(startTimeNs: bigint): void {
    const endTimeNs = process.hrtime.bigint(); // 計測終了時刻
    const elapsedMs = Number(endTimeNs - startTimeNs) / 1_000_000; // ナノ秒 → ミリ秒
    const usage = process.resourceUsage(); // リソース使用量
    const rssMiB = usage.maxRSS / 1024;    // KiB → MiB
    console.log(`Performance: time=${elapsedMs.toFixed(3)}ms rss=${rssMiB.toFixed(2)}MiB`);
}
