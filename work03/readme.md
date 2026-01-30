# 第二回課題：パスワードマネージャー（CLI）

## 概要

ローカル環境で動作する **CLI ベースのパスワードマネージャー** を実装する。

本課題では、機能の正しさだけでなく、**設計判断・テストの網羅性・実装の堅牢性**がレビュー対象となる。


---
**裏テーマ：：TDDでやってみる!!**


## 条件

- 言語：TypeScript
  - Node.js 25.x で動作すること
  - Type Stripping での実行を前提とする
- 実行形式：CLI
- 提出物
  - `.mts` ファイルを含む動作に必要な一式
  - 仕様メモ（`spec.md`）
    - 課題に明記されておらず、各自の判断で仕様とした部分については、**仕様メモ（`spec.md`）**としてまとめて提出すること
- 外部パッケージ：✖（Node.js 標準モジュールのみ使用可）
- 外部コマンド：✖

---

## 評価基準

業務レベルのプログラムである事を重視し、下記の点を評価する。

- 可読性（ソース整形、適切なコメント）
- ログ出力（必要な情報を分かりやすく出力しているか）
- エラー処理（異常系への適切な対処）
- テストの網羅性（仕様の穴を想定できているか）

---

## コマンド仕様

以下のサブコマンドとオプションパラメーターは **必須要件** とする。 これらを満たした上での拡張は自由とする。

### Usage

```
node pwman.mts init <masterPassword>

node pwman.mts add <service> <username> <password> [--master <masterPassword>]

node pwman.mts get <service> <username> [--master <masterPassword>]

node pwman.mts del <service> <username> [--master <masterPassword>]

node pwman.mts list [--asc service|username] [--desc service|username]

node pwman.mts export <csvFilePath> [--master <masterPassword>]

node pwman.mts import <csvFilePath> [--master <masterPassword>]

node pwman.mts change-master <oldMasterPassword> <newMasterPassword>

node pwman.mts status

node pwman.mts help
```

### 各コマンドの説明

- `init <masterPassword>`

  - パスワードマネージャーを初期化し、マスターパスワードを設定する。

- `add <service> <username> <password> [--master <masterPassword>]`

  - 指定したサービス名・ユーザー名・パスワードを登録する。

- `get <service> <username> [--master <masterPassword>]`

  - 指定したサービス名・ユーザー名に対応するパスワードを取得し、標準出力に表示する。

- `del <service> <username> [--master <masterPassword>]`

  - 指定したサービス名・ユーザー名に対応する情報を削除する。

- `list [--asc service|username] [--desc service|username]`

  - 登録されているサービス名・ユーザー名の一覧を表示する。
  - `--asc` または `--desc` に続けて `service` もしくは `username` を指定することで、並び順と並び替え対象を指定できる。
  - オプションを指定しない場合の挙動は参加者に委ねる。
  - **マスターパスワードなしで使用可能。**
  - **パスワードは表示してはならない。**

- `export <csvFilePath> [--master <masterPassword>]`

  - 指定したパスに CSV ファイルを出力する。

- `import <csvFilePath> [--master <masterPassword>]`

  - 指定した CSV ファイルを読み込み、データを登録する。

- `change-master <oldMasterPassword> <newMasterPassword>`

  - マスターパスワードを変更する。

- `status`

  - 参照しているデータベースファイルのパスと、登録されている件数を表示する。

- `help`

  - 各コマンドの使い方を表示する。表示内容は参加者に委ねる。

---

## データストア

- SQLite（`node:sqlite`）を使用すること
  - `node:sqlite` は実行時に以下の警告を出力するが、本課題では **無視して良い** とする。
    ```
    (node:xxxxx) ExperimentalWarning: SQLite is an experimental feature and might change at any time
    ```
    また、警告を非表示にしたい場合は、以下の環境変数設定を用いてもよい。
    ```powershell
    $env:NODE_OPTIONS="--disable-warning=ExperimentalWarning"
    ```
- DB ファイルは **ソースコードと同じディレクトリ** に配置すること
- スキーマ設計は参加者に委ねる
  - **サービス名とユーザー名の組み合わせで、1つのパスワードを保存できること**

---

## セキュリティ要件

- パスワードマネージャーは **マスターパスワード** により保護される
- ソースコードおよび DB ファイルについては、ある程度セキュリティを考慮すること
- インポート・エクスポートで使用する CSV ファイルについては、セキュリティを考慮する必要はない

---

## CSV インポート／エクスポート

- import / export に使用する CSV は **Microsoft Excel で開ける形式**であること
  - Excel で編集した CSV ファイルを import できる必要はない
- CSV の詳細なフォーマットは参加者が設計すること

---

## 仕様メモ（`spec.md`）について

本課題では、仕様に明記されていない点については、各自が設計判断を行うことを前提としている。 そのため、以下のような内容については **仕様メモ**として文書化し、提出物に含めること。

- 仕様に記載されていない挙動について、どのように判断・実装したか
- 複数の選択肢が考えられる点について、どの案を採用したかとその理由
- セキュリティ・UX・実装コストなどの観点で行ったトレードオフ
- 本来は拡張性や業務利用を意識して実装したかったが、**時間的・技術的制約により実装できなかった点**と、その理由。

仕様メモの形式は自由とするが、レビュー時に設計判断を説明できる内容であることが望ましい。
