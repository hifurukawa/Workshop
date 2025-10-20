class Calculator {
    constructor() {
        // -----------------------------
        // 演算子定義：優先度と種類
        // -----------------------------
        this.OPERATORS = {
            "+": { precedence: 1, type: "binary" }, // 加算
            "-": { precedence: 1, type: "binary" }, // 減算
            "*": { precedence: 2, type: "binary" }, // 乗算
            "/": { precedence: 2, type: "binary" }, // 整数除算
        };

        // 単項演算子としてサポート
        this.UNARY_OPERATORS = ["+", "-"];

        // -----------------------------
        // サポート外の文字・構文パターン
        // -----------------------------
        this.UNSUPPORTED_PATTERNS = [
            /[%^]/,             // 剰余 (%) やべき乗 (^)
            /\./,               // 小数点
            /e[+-]?\d+/i,       // 指数表記 (1e10 など)
            /[a-zA-Z_]/,        // 変数名や関数名
            /[^\d+\-*/() \t]/,  // その他不正記号
        ];

        // -----------------------------
        // エラーコード定義
        // -----------------------------
        this.ERROR = {
            PARAM: 1,   // 入力なし
            SYNTAX: 2,  // 構文エラー（不正文字・括弧不一致など）
            ARITH: 3,   // 算術エラー（ゼロ除算・安全整数範囲外）
        };

        // -----------------------------
        // パーサ・評価用の状態管理
        // -----------------------------
        this.tokens = []; // トークン列
        this.pos = 0;     // 現在位置
    }

    // ===============================================================
    // メイン処理：電卓実行
    // ===============================================================
    run() {
        try {
            const expr = this.getInput();      // コマンドライン引数から式を取得
            const tokens = this.tokenize(expr); // 式をトークン化
            const ast = this.parse(tokens);     // トークンからASTを構築
            const result = this.evaluate(ast);  // ASTを評価して結果を取得
            this.output(result);                // 結果を出力
        } catch (err) {
            // エラー発生時はメッセージを表示して終了
            console.error(err.message);
            process.exit(err.code || 1);
        }
    }

    // ===============================================================
    // 入力取得と検証
    // ===============================================================
    getInput() {
        // コマンドライン引数を連結して1つの式にする
        const expr = process.argv.slice(2).join(" ");
        if (!expr || expr.trim() === "") {
            // 空入力はエラー
            this.fail("パラメータエラー: 式が指定されていません", this.ERROR.PARAM);
        }
        return expr.trim(); // 前後空白を除去して返す
    }

    // ===============================================================
    // 式をトークンに分解
    // ===============================================================
    tokenize(expr) {
        // サポート外文字のチェック
        for (const pattern of this.UNSUPPORTED_PATTERNS) {
            if (pattern.test(expr)) {
                this.fail("構文エラー: サポート外の文字・構文を検出", this.ERROR.SYNTAX);
            }
        }

        const tokens = [];         // トークン格納用配列
        let currentNumber = "";    // 数字を一時的に蓄積
        let parenDepth = 0;        // 括弧の深さ

        for (const ch of expr) {
            if (ch === " ") continue; // 半角スペースは無視
            if (/\s/.test(ch)) {
                // タブや改行などの空白文字はサポート外
                this.fail("構文エラー: サポート外の空白文字", this.ERROR.SYNTAX);
            }

            // 数字を蓄積
            if (/[0-9]/.test(ch)) {
                currentNumber += ch;
                continue;
            }

            // 数字の終了時にトークン化
            if (currentNumber) {
                const value = Number(currentNumber);
                if (!Number.isSafeInteger(value)) {
                    this.fail("算術エラー: 安全整数範囲外", this.ERROR.ARITH);
                }
                tokens.push({ type: "number", value });
                currentNumber = "";
            }

            // 演算子をトークン化
            if (this.OPERATORS[ch]) {
                tokens.push({ type: "operator", value: ch });
                continue;
            }

            // 括弧をトークン化
            if (/[()]/.test(ch)) {
                tokens.push({ type: "paren", value: ch });
                parenDepth += ch === "(" ? 1 : -1;
                if (parenDepth < 0) {
                    this.fail("構文エラー: 括弧の対応が不正です", this.ERROR.SYNTAX);
                }
                continue;
            }

            // それ以外は不正文字
            this.fail(`構文エラー: 不正な文字「${ch}」`, this.ERROR.SYNTAX);
        }

        // 最後に残った数字をトークン化
        if (currentNumber) {
            const value = Number(currentNumber);
            if (!Number.isSafeInteger(value)) {
                this.fail("算術エラー: 安全整数範囲外", this.ERROR.ARITH);
            }
            tokens.push({ type: "number", value });
        }

        // 括弧の不一致チェック
        if (parenDepth !== 0) {
            this.fail("構文エラー: 括弧の対応が不正です", this.ERROR.SYNTAX);
        }

        return tokens;
    }

    // ===============================================================
    // 構文解析:トークンから演算子の優先度に基づく式（AST）を構築
    // ===============================================================
    parse(tokens) {
        this.tokens = tokens; // パーサ用に保持
        this.pos = 0;         // 現在位置リセット
        const ast = this.parseExpression(); // 式全体を解析
        if (this.pos < this.tokens.length) {
            this.fail("構文エラー: 不要なトークンがあります", this.ERROR.SYNTAX);
        }
        return ast;
    }

    /**
     * 演算子の優先度を考慮した式解析
     * @param {number} minPrecedence - 現在処理中の最小優先度
     * 入力トークンが　2  +  3  *  4  -  5　の場合
     * 出力AST例： (2+(3*4))-5
     * Binary(-)
     * ├── Binary(+)
     * │   ├── Number(2)
     * │   └── Binary(*)
     * │       ├── Number(3)
     * │       └── Number(4)
     * └── Number(5)
     */
    parseExpression(minPrecedence = 0) {
        // まず左辺を解析
        let left = this.parseFactor();

        // 現在のトークンが演算子で、優先度が minPrecedence 以上なら右辺を結合
        while (true) {
            const token = this.peek();
            if (!token || token.type !== "operator") break;

            const opInfo = this.OPERATORS[token.value];
            if (!opInfo || opInfo.precedence < minPrecedence) break;

            const operator = token.value;
            const precedence = opInfo.precedence;
            this.advance(); // 演算子を消費

            // 優先度に応じて右辺を再帰的に解析
            // 同じ優先度の演算子は左結合になる
            let right = this.parseExpression(precedence + 1);

            left = { type: "binary", operator, left, right };
        }

        return left;
    }

    parseFactor() {
        // 単項演算子 +/-
        if (this.match("+") || this.match("-")) {
            const operator = this.previous().value;
            const right = this.parseFactor();
            return { type: "unary", operator, right };
        }

        // 括弧式
        if (this.match("(")) {
            const expr = this.parseExpression();
            if (!this.match(")")) {
                this.fail("構文エラー: 括弧の閉じ忘れ", this.ERROR.SYNTAX);
            }
            return expr;
        }

        // 数値
        const token = this.peek();
        if (token && token.type === "number") {
            this.advance();
            return { type: "number", value: token.value };
        }

        // それ以外は構文エラー
        this.fail("構文エラー: 予期しないトークン", this.ERROR.SYNTAX);
    }

    // ===============================================================
    // AST評価（計算実行）
    // ===============================================================
    evaluate(node) {
        switch (node.type) {
            case "number":
                return node.value;

            case "unary":
                // 単項演算子
                return node.operator === "-" ? -this.evaluate(node.right) : +this.evaluate(node.right);

            case "binary":
                const left = this.evaluate(node.left);
                const right = this.evaluate(node.right);

                // ゼロ除算チェック
                if (node.operator === "/" && right === 0) {
                    this.fail("算術エラー: ゼロ除算", this.ERROR.ARITH);
                }

                let result;
                switch (node.operator) {
                    case "+": result = left + right; break;
                    case "-": result = left - right; break;
                    case "*": result = left * right; break;
                    case "/": result = Math.trunc(left / right); break; // 整数除算
                }

                // 安全整数チェック
                if (!Number.isSafeInteger(result)) {
                    this.fail("算術エラー: 安全整数範囲外", this.ERROR.ARITH);
                }

                return result;

            default:
                this.fail("算術エラー: 不明なノード", this.ERROR.ARITH);
        }
    }

    // ===============================================================
    // 出力
    // ===============================================================
    output(result) {
        // -0は0に変換して表示
        console.log(Object.is(result, -0) ? 0 : result);
    }

    // ===============================================================
    // ユーティリティ関数
    // ===============================================================
    match(value) {
        // 現在のトークンが指定値なら進める
        const token = this.peek();
        if (token && token.value === value) {
            this.advance();
            return true;
        }
        return false;
    }

    peek() { return this.tokens[this.pos]; }          // 現在トークン取得
    previous() { return this.tokens[this.pos - 1]; } // 1つ前のトークン取得
    advance() { this.pos++; }                         // トークン位置を進める

    fail(message, code) {
        const err = new Error(message);
        err.code = code;
        throw err; // 例外をスロー
    }
}

// ===============================================================
// 実行
// ===============================================================
new Calculator().run();