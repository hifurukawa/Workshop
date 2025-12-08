# ログ集計プログラム

## 条件

* 言語：TypeScript
  * Node.js 25.2 で動作すること
    * Type Strippingでの動作とする
* 提出物：`.ts` ファイルを含む動作に必要な一式
* 外部パッケージ：✖
* 外部コマンド：✖

---

## 評価基準

パフォーマンスを測定し、下記の点を評価する。

* 実行時間
* 最大メモリ使用量

また、業務レベルのプログラムである事を重視し、下記の点を評価する。

* 可読性（ソース整形、適切なコメント）
* ログ出力（必要な情報を分かりやすく出力しているか）
* エラー処理（異常系への適切な対処）

---

## 要件

* 実行：

```
node log_summary.ts <logfile.gz>
```

* 入力：

  * `<logfile.gz>`：`journalctl` などから出力された **gzip 圧縮ログファイル**

* 出力：

  1. 認証結果数
  2. IPごとの認証失敗数
  3. 実行時パフォーマンス

* 終了コード：

  * 成功：0
  * エラー：非 0
  * ログフォーマット不一致行はエラーとしない（スキップ）

---

## ログ形式（必須仕様）

基本的には **一般的な syslog 形式** に従う。
フォーマット不一致行はエラーとせず、無視して処理を続行する。

各行は次の書式であることを前提とする：

```
MMM dd HH:MM:SS host pname[pid]: message
```

※`[pid]`は省略可能

例：

```
Feb 17 17:24:43 vagrant sshd[4157838]: Failed password for invalid user ubuntu from 192.168.0.51 port 12028 ssh2
Apr 20 08:37:45 vagrant kernel: kauditd_printk_skb: 20 callbacks suppressed
Jun 05 18:49:37 vagrant sshd[135134]: Accepted publickey for vagrant from 10.0.2.2 port 37276 ssh2: RSA SHA256:hRLKT8BqnbFxHlxjDB3OLXznk2/Pox3NF/Rt+FQ0CUw
Jun 07 16:52:01 vagrant sshd[145418]: Accepted password for vagrant from 192.168.0.51 port 5494 ssh2
Jun 12 01:13:11 vagrant sshd[279531]: Failed password for root from 192.168.250.40 port 41486 ssh2
```

---

## sshd の対象ログ

### 認証成功（Accepted）

```
Accepted publickey for USER from IP ...
Accepted password for USER from IP ...
```

### 認証失敗（Failed）

```
Failed password for USER from IP ...
Failed password for invalid user USER from IP ...
```

---

## 出力1：認証結果数

認証ログを集計し、ユーザーごと、メソッドごとに認証結果数を表示する。
成功数は全件を表示し、失敗数は上位最大10件を表示する。
また、トータルの失敗数も表示する。

#### 出力例（整形は任意）：

```
Authentication successes (all):
  User     Method     Success
  ---------------------------
  vagrant  publickey  120
  vagrant  password   30

Authentication failures (top 10):
  User     Method    Failure
  --------------------------
  root     password  88
  ubuntu   password  12
  vagrant  password  4
  ...

Total authentication failures: 4821
```

### ソートルール

1. Success / Failure 降順
2. User 昇順
3. Method 昇順

---

## 出力2：IPごとの認証失敗数

IPごとに認証失敗を集計し、上位最大10件を表示する。

#### 出力例（整形は任意）：

```
Authentication failures by IP (top 10):
  IP            Failure
  ---------------------
  192.168.1.10  100
  10.0.0.5      4
```

### ソートルール

1. Failure 降順
2. IP 昇順

---

## 出力3：実行時パフォーマンス

プログラムの実行時パフォーマンス数値として下記2項目を出力する。

* 実行時間
  * process.hrtimeより計算し、ミリ秒の単位で出力する
* 最大使用メモリ量
  * process.resourceUsage().maxRSSより計算し、メビバイトの単位で出力する

#### 出力例（整形は任意）：

```
Performance: time=1234ms rss=56MiB
```
