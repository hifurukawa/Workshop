import * as fs from 'fs';
import * as zlib from 'zlib';
import { parseAuthLine } from '../lib/parse_auth_line.ts';
import type { Stats } from './auth_stats.ts';
import { updateStats } from './auth_stats.ts';
import { AppError } from '../lib/error.ts';


// =============================
// ログファイル処理モジュール
// =============================
/**
 * gzip 圧縮されたログファイルをストリーミングで読み込み、
 * 解凍 → 行単位パース → 統計更新
 */
export function processLogFile(logFile: string, stats: Stats): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const fileStream = fs.createReadStream(logFile);
        const gunzip = zlib.createGunzip();

        fileStream.on('error', (err: Error) => {
            reject(new AppError(`Failed to read file: ${err.message}`));
        });

        gunzip.on('error', (err: Error) => {
            reject(new AppError(`Failed to decompress gzip: ${err.message}`));
        });

        /**
         * NOTE: 
         * readline を使わずに自前でバッファリングして行処理
         * パフォーマンス比較:
         * readline使用time=9929.242ms rss=123.20MiB 
         * → time=8225.053ms rss=124.06MiB
         */
        let leftover = '';

        gunzip.on('data', (chunk: Buffer) => {
            // chunk + 前回の余り
            const text = leftover + chunk.toString('utf8');

            // 行に分解
            const lines = text.split('\n');

            // 最後の行は途中の可能性があるので後回し
            leftover = lines.pop()!;

            // 完成した行だけ処理
            for (const line of lines) {
                const info = parseAuthLine(line);
                if (info) updateStats(stats, info);
            }
        });

        gunzip.on('end', () => {
            // leftover がまだ残っていたら最終行として処理
            if (leftover) {
                const info = parseAuthLine(leftover);
                if (info) updateStats(stats, info);
            }
            resolve();
        });

        // パイプ（接続）開始
        fileStream.pipe(gunzip);
    });
}
