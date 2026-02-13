## テスト項目

| No. | 機能（コマンド） | 種別 | シナリオ | 手順 | 期待結果 | 観点 |
|---|---|---|---|---|---|---|
| 1 | init | 正常 | 初回初期化 | DB未存在で init 実行しPW入力 | DB作成、exit 0 | 初期状態 |
| 2 | init | 異常 | 再初期化 | init後に再度 init | エラー、DB変更なし | 冪等性 |
| 3 | init | 異常 | PW未入力 | init後 Enterのみ | エラー、DB未作成 | 入力検証 |
| 4 | init | 異常 | 入力中断 | PW入力中にCtrl+C | DB未作成 | 中断耐性 |
| 5 | 共通 | 異常 | コマンド未指定 | node pwman.mts | exit 2、help表示 | 入口防御 |
| 6 | 共通 | 異常 | 未知コマンド | node pwman.mts foo | エラー、DB変更なし | 構文検証 |
| 7 | add | 異常 | 引数なし | addのみ実行 | exit 2 | 必須引数 |
| 8 | get | 異常 | 引数なし | getのみ実行 | exit 2 | 必須引数 |
| 9 | del | 異常 | 引数なし | delのみ実行 | exit 2 | 必須引数 |
|10 | add | 正常 | 新規登録 | 正PWで add | listに反映 | 基本機能 |
|11 | add | 異常 | init前実行 | initせず add | エラー | 状態前提 |
|12 | add | 異常 | 認証失敗 | 誤PWで add | 登録されない | 認証 |
|13 | add | 異常 | 重複登録 | 同一keyで add | エラー | 一意制約 |
|14 | add | 異常 | 引数不足 | password省略 | exit 2 | 引数検証 |
|15 | get | 正常 | 資格情報取得 | 正PWで get | stdoutにPW | 出力制御 |
|16 | get | 異常 | 認証失敗 | 誤PW | 表示なし | 秘密情報 |
|17 | get | 異常 | 未存在取得 | 未登録key指定 | エラー | 存在確認 |
~~|18 | get | 異常 | stdout漏洩防止 | get実行 | stdout空 | パイプ耐性 |~~
|19 | del | 正常 | 削除 | 正PWで del | listから消える | 状態変更 |
|20 | del | 異常 | 未存在削除 | 未登録key | エラー | 存在確認 |
|21 | del | 異常 | 認証失敗 | 誤PW | 削除されない | 認証 |
|22 | list | 正常 | 一覧表示 | list実行 | service,username | 情報制御 |
|23 | list | 正常 | デフォルトソート | 複数登録後list | 昇順 | 仕様既定 |
|24 | list | 異常 | 不正ソート | --asc foo | exit 2 | 引数検証 |
|25 | export | 正常 | CSV出力 | 正PWでexport | CSV生成 | I/O |
|26 | export | 異常 | 認証失敗 | 誤PW | CSV未生成 | 副作用防止 |
|27 | export | 異常 | 不存在Dir | 存在しないpath | exit 4 | 事前検証 |
|28 | export | 異常 | 書込不可 | 権限なしpath | exit 4 | I/O |
|29 | export | 異常 | 途中強制終了 | export中にCtrl+C | 不完全CSVなし | 原子性 |
|30 | export | 異常 | 強制kill | SIGKILL送信 | CSV未生成 | 耐障害性 |
|31 | import | 正常 | CSV取込 | exportCSVをimport | DB置換 | 一括更新 |
|32 | import | 異常 | 不存在CSV | 存在しないfile | exit 4 | 事前検証 |
|33 | import | 異常 | 認証失敗 | 誤PW | DB未変更 | 副作用防止 |
|34 | import | 異常 | 不正行 | 1行不正 | 全体失敗 | トランザ |
|35 | import | 異常 | UTF-8外 | SJIS CSV | エラー | 文字コード |
|36 | import | 異常 | 制御文字 | tab含む | エラー | フォーマット |
|37 | import | 異常 | 途中中断 | import中Ctrl+C | DB未変更 | 原子性 |
|38 | import | 異常 | kill中断 | SIGKILL | DB未変更 | 耐障害性 |
|39 | change-master | 正常 | PW変更 | 正旧新PW | 再暗号化 | 再暗号化 |
|40 | change-master | 正常 | 同一PW | 旧=新 | 再暗号化なし | 最適化 |
|41 | change-master | 異常 | 旧PW誤り | 誤旧PW | DB未変更 | 認証 |
|42 | change-master | 異常 | 新PW未入力 | new省略 | エラー | 入力検証 |
|43 | status | 正常 | 状態表示 | status実行 | DBパス/件数 | 可観測性 |
|44 | status | 異常 | init前 | 初期化前実行 | エラー表示 | 状態判定 |
|45 | help | 正常 | ヘルプ表示 | help実行 | Usage表示 | UX |
|46 | 共通 | 異常 | 未知オプション | --unknown | exit 2 | 引数検証 |
|47 | 共通 | 異常 | 引数過剰 | 余分な引数 | exit 2 | 厳密性 |
|48 | 共通 | 異常 | 標準入力EOF | PW入力でCtrl+D | エラー | 入力耐性 |
|49 | 共通 | 異常 | ログ漏洩防止 | エラー発生 | 秘密情報なし | セキュリティ |
|50 | 共通 | 異常 | exit code検証 | 各異常実行 | 仕様通り | 仕様遵守 |  

### 1 自動テスト項目

| No. | 機能（コマンド）      | 種別 | シナリオ      | 手順             | 期待結果             | 観点     |
| --- | ------------- | -- | --------- | -------------- | ---------------- | ------ |
| 1-   | init          | 正常 | 初回初期化     | DB未存在で init 実行 | DB作成、exit 0      | 初期状態   |
| 2-   | init          | 異常 | 再初期化      | init後に再度 init  | エラー、DB変更なし       | 冪等性    |
| 3-   | init          | 異常 | PW未入力     | 空PW入力          | エラー、DB未作成        | 入力検証   |
| 5-   | 共通            | 異常 | コマンド未指定   | node pwman.mts | exit 2、help表示    | 入口防御   |
| 6-   | 共通            | 異常 | 未知コマンド    | foo 実行         | エラー              | 構文検証   |
| 7   | add           | 異常 | 引数なし      | addのみ          | exit 2           | 必須引数   |
| 8   | get           | 異常 | 引数なし      | getのみ          | exit 2           | 必須引数   |
| 9   | del           | 異常 | 引数なし      | delのみ          | exit 2           | 必須引数   |
| 10-  | add           | 正常 | 新規登録      | 正PWで add       | list反映           | 基本機能   |
| 11  | add           | 異常 | init前     | initせず add     | エラー              | 状態前提   |
| 12  | add           | 異常 | 認証失敗      | 誤PW            | 登録なし             | 認証     |
| 13  | add           | 異常 | 重複登録      | 同一key          | エラー              | 一意制約   |
| 14  | add           | 異常 | 引数不足      | password省略     | exit 2           | 引数検証   |
| 15  | get           | 正常 | 資格情報取得    | 正PW            | stdout出力         | 出力制御   |
| 16  | get           | 異常 | 認証失敗      | 誤PW            | 表示なし             | 秘密情報   |
| 17  | get           | 異常 | 未存在取得     | 未登録key         | エラー              | 存在確認   |
~~| 18  | get           | 異常 | stdout漏洩  | get実行          | stdeout空          | パイプ耐性  |~~
| 19  | del           | 正常 | 削除        | 正PW            | listから消える        | 状態変更   |
| 20  | del           | 異常 | 未存在削除     | 未登録key         | エラー              | 存在確認   |
| 21  | del           | 異常 | 認証失敗      | 誤PW            | 削除なし             | 認証     |
| 22  | list          | 正常 | 一覧表示      | list           | service,username | 情報制御   |
| 23  | list          | 正常 | デフォルトソート  | list           | 昇順               | 仕様既定   |
| 24  | list          | 異常 | 不正ソート     | --asc foo      | exit 2           | 引数検証   |
| 25  | export        | 正常 | CSV出力     | 正PW            | CSV生成            | I/O    |
| 26  | export        | 異常 | 認証失敗      | 誤PW            | CSV未生成           | 副作用防止  |
| 27  | export        | 異常 | 不存在Dir    | 不正path         | exit 4           | 事前検証   |
| 28  | export        | 異常 | 書込不可      | 権限なし           | exit 4           | I/O    |
| 31  | import        | 正常 | CSV取込     | 正常CSV          | DB置換             | 一括更新   |
| 32  | import        | 異常 | 不存在CSV    | 不正file         | exit 4           | 事前検証   |
| 33  | import        | 異常 | 認証失敗      | 誤PW            | DB未変更            | 副作用防止  |
| 34  | import        | 異常 | 不正行       | CSV1行不正        | 全体失敗             | トランザ   |
| 35  | import        | 異常 | UTF-8外    | SJIS           | エラー              | 文字コード  |
| 36  | import        | 異常 | 制御文字      | tab含む          | エラー              | フォーマット |
| 39  | change-master | 正常 | PW変更      | 正旧新PW          | 再暗号化             | 再暗号化   |
| 40  | change-master | 正常 | 同一PW      | 旧=新            | 処理スキップ           | 最適化    |
| 41  | change-master | 異常 | 旧PW誤り     | 誤旧PW           | DB未変更            | 認証     |
| 42  | change-master | 異常 | 新PW未入力    | new省略          | エラー              | 入力検証   |
| 43-  | status        | 正常 | 状態表示      | status         | DB/件数            | 可観測性   |
| 44-  | status        | 異常 | init前     | 初期化前           | エラー              | 状態判定   |
| 45  | help          | 正常 | ヘルプ       | help           | Usage表示          | UX     |
| 46  | 共通            | 異常 | 未知オプション   | --unknown      | exit 2           | 引数検証   |
| 47  | 共通            | 異常 | 引数過剰      | 余分引数           | exit 2           | 厳密性    |
| 49  | 共通            | 異常 | ログ漏洩      | エラー            | 秘密情報なし           | セキュリティ |
| 50  | 共通            | 異常 | exit code | 異常系            | 仕様通り             | 仕様遵守   |
| 51  | change-master | 異常 | SIGINT中断    | 処理中にSIGINT送信 | DB未変更 | 原子性      |
| 52  | change-master | 異常 | 人工途中失敗      | 再暗号化途中で例外    | DB未変更 | トランザ     |
| 53  | change-master | 異常 | 50件目で失敗     | 100件中50件目で例外 | DB未変更 | 全件or0件   |
| 54  | export/import | 異常 | CSVにquote含む | `"a,b""c"`含む | 壊れず復元 | フォーマット耐性 |



### 2. 手動実行テスト項目
| No. | 機能（コマンド） | 種別 | シナリオ    | 手順            | 期待結果   | 観点   |
| --- | -------- | -- | ------- | ------------- | ------ | ---- |
| 4   | init     | 異常 | 入力中断    | PW入力中Ctrl+C   | DB未作成  | 中断耐性 |
※以下は処理が一瞬で終了したため実行できていません。
| 29  | export   | 異常 | 途中強制終了  | export中Ctrl+C | CSV未生成 | 原子性  |
| 30  | export   | 異常 | 強制kill  | SIGKILL       | CSV未生成 | 耐障害性 |
| 37  | import   | 異常 | 途中中断    | import中Ctrl+C | DB未変更  | 原子性  |
| 38  | import   | 異常 | kill中断  | SIGKILL       | DB未変更  | 耐障害性 |
| 48  | 共通       | 異常 | 標準入力EOF | Ctrl+D        | エラー    | 入力耐性 |