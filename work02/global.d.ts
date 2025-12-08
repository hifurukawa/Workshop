// types/node をインストールせずに型定義を行うためのファイル
declare const process: any;

declare class Buffer {
    toString(encoding?: string): string;
}

// Node.js 標準モジュールのダミー宣言
declare module 'fs' {
    const fs: any;
    export = fs;
}

declare module 'zlib' {
    const zlib: any;
    export = zlib;
}
