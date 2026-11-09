# 総評

- **重大：確認されず。** reviewer の権限順序（permissions.ts 重大抜けなし）は前回どおり正しく、新たな直接迂回は確認できません。
- **中：5件、軽微：4件が残存/新規です。** 前回の中2・5と軽微1・2・3・5は対処が概ね十分ですが、中1・3・4・6は部分的です。起動前検査と
  symlink 修正のコードは改善していますが、MCP の実名列挙、§6.4 の許可リスト形式、L2 の XDG 分離、E2E の最終アーティファクト条
  件は残っています。
- 本回は shell ツールの環境不具合のため再実行はできず、静的／文書突合のみで実施しました。

## 前回指摘の中6・軽微5への対処判定

### 中

1. **check.ts 未カバー（前回中1）：部分的**
   - 改善：`src/check.ts:33-80` は
     `write`/`websearch`/`question`/`execute`/`some_unknown_future_tool`/`external_directory`
     を追加しました。1 reviewer あたり 22 件×8名＋primary 15 件＝191 件となり、検証記録の 191 件と一致します。
     `main():162-172` も 8 名数と primary の存在を強制します。
   - 残存：`reviewerIds` は install config から導出されるため、期待する 8 名の身元を固定していません。誤った 8 名を
     配置しても数だけは通り、期待値もその 8 名から作られます。設計 §6.5 の「想定リスト」とは言い難いです。また
     `some_unknown_future_tool` はワイルドカードの代理で、設計 §6.4 が求める MCP 専用アクションや各 MCP サー
     バーツールの実名列挙ではありません。`runExpectations()` は自前の `evaluatePermissions` で判定するため、
     ホストの glob 意味論が自前と異なる場合、実効拒否を過大評価します。

2. **AGENTS.md basename 仮定（前回中2）：部分的**
   - 改善：`src/permissions.ts:36-39` に `"*/AGENTS.md"` / `"*/CLAUDE.md"` を追加し、
     `check.ts:63-77` で絶対パスも検査するようになりました。自前の `globToRegExp` では `*` が `.*` となり、
     絶対パスをカバーします。
   - 残存：ホストの `*` が `/` を跨ぐか（POSIX glob 的に `[^/]*` の可能性）は Phase 0 未確定のため、
     `*/AGENTS.md` の「深さ 1 のみ」や `*.env` の解釈が自前とずれる可能性があります。絶対パスの実地リード試行もされていません。
     ホスト自動注入（§7.3）は read 拒否では止まらず、ランチャーに XDG 分離がなく、グローバル分は未カバーです。README が「注入は観
     測されず、保証は親会話分離＋ファイル名ガード」と限定している点は正直ですが、設計 §7.3 の標準手順とは一致しません。

3. **§6.4 許可リスト形式（前回中3）：未対応（ただし開示は一致）**
   - `src/permissions.ts:44-45` は依然 bundle のみ許可で、対象文書／prior report のファイル単位の追加は
     ありません。`src/check.ts:49-54` の `external_directory` deny だけです。README の制限事項「
     対象は project 内に置く」と検証記録の「言えない」は、この欠陥を正直に開示しており主張と実装は一致します。
   - 加えて `read "/outside…"` の deny は検査されておらず、`read "*" allow` と
     `external_directory` の相互作用（ホストが read を external_directory で止めるか）は未確認です。
     probe のネガティブ試行も `.env` と write のみです。

4. **§6.6 コマンド引数規約（前回中4）：部分的**
   - 改善：`src/generate.ts:222-227` のテンプレートに「data 扱い／絶対パス／`$(...)` や backticks は
     停止して file 経由を案内」が入り、生成物への反映はされています。
   - 残存：`$ARGUMENTS` の直渡しは残り、ホスト側の事前展開はプロンプトで防げません。設計 §6.6 の標準入力経路（通常メッセージ＋パス）
     は e2e が依然 `/egm-draft /egm-review` のスラッシュコマンド＋自由文（
     `tests/e2e/run.ts:157,173`）で回しており、README に残存リスクの明記もありません。

5. **宛先 symlink（前回中5）：コードは十分、テスト残存**
   - `src/generate.ts:85-108` が `lstat` で dangling symlink を拒否し、最近傍 ancestor の
     `realpath` 比較で親 symlink を拒否します（source-tree 経由と一般 symlink を含め拒否）。重大なバイパスは塞
     がっています。
   - 残存：`tests/unit/generate.test.ts:23-33` に symlink／symlinked-parent のテストがなく、
     回帰防止が弱いです。`realpath` が dangling ancestor で ENOENT を投げる等、fail-closed だが例外文
     が素の実装エラーです。検証後 mkdir までの TOCTOU は installer 自己実行を想定する範囲では軽微です。

6. **e2e/probe 自明通過（前回中6）：部分的**
   - 改善：e2e は `verifyRun({ reviewers: ALL_REVIEWERS })`（`run.ts:194-197`）に厳格化さ
     れ、verifier の `ALL_REVIEWERS` 欠落で `report.ok=false` となるため、派遣不足で自明通過しません。第4
     回で egm-style 未派遣を検出し第5回で修正した記録は整合します。probe は L1（親／.env）と L2（指示ファイル）を 2 回の
     `verifyRun` に分離しました（`probe/run.ts:122-132`）。
   - 残存：e2e の `pass`（`run.ts:203-205`）は `briefDone && designDoc && report.ok`
     のみで `reviewDone`（`consolidated/final` と `zoom_out` の存在）を含みません。最終アーティファクト未
     達でも driver 上は PASS になり得ます。第5回 PASS は記録の目視成果物リストに依存します。probe の L1/vL2 分離も各
     `verifyRun` が派遣・read・ツールを二重検査するため、帰属が完全には分離しません。

### 軽微

- **軽微1 ランチャー注入：十分。** `FORBIDDEN_PATH_CHARS`（`generate.ts:67`）の расшиと `shq` 単
  一引用符（`:242,247,250`）で対応。`'`/`"`/`;` は引用符内では字面です。
- **軽微2 URL エンコード：十分。** `cli.ts:18-20` と `generate.ts:257` で `fileURLToPath` を
  使い、空白・日本語パスに対応しました。
- **軽微3 verifier 許可不一致：十分。** `tests/verifier/verify.ts:112-118` は
  `read`/`glob` のみ許容し、`list` を例外化します。
- **軽微4 CLI 引数：概ね十分。** `--egm` の値必須と splice（`cli.ts:24-35`）で誤認は解消。未知の `--foo`
  の扱いが未定義ですが軽微です。
- **軽微5 数値/参照：十分。** README は「108 expectations」の記載を消し、検証記録ファイルも存在します。件数は 191 で整
  合します。

## 検証記録と README の一致

- **一致**：191 件（check.ts:33-97×8＋15）、8 reviewer＋primary、L2 ファイル名ガードの限定、対象はプロジェク
  ト内、直接起動は未保証は実装と概ね一致します。
- **不一致・過強**：
  - README 冒頭「every review is performed by a fresh-context Goldfish」は L2 注記で弱ま
    るが、設計 §10 の L2 未達時の限定表記とは緊張します。検証記録の「言える／言えない」は実態に合わせて限定されています。
  - §7.3 のクリーン環境＋XDG 分離は標準手順として実装がなく、E2E/probe が AGENTS.md を置いており、設計と運用がずれます。
  - Session export や effective dump の保存物がないため、第3〜5回実行の session ID（`ses_e41…`）の
    裏付けは文書内主張のみです（§7.4 の保存要件）。
  - §6.6 の「残存リスクは README に明記する」を README が満たしていません。

## 残存／新規問題の概要

- **中**：
  1. check の 8 名固定と MCP 実名列挙の不足（中1前半）。
  2. ホスト glob 意味論に依存する自前 `evaluatePermissions` での検証（circularity、
     `.env`/AGENTS.MD の絶対経路）。
  3. §6.4 の対象文書許可リスト未実装と `read` 外部経路の未検証（中3）。
  4. L2 の XDG 分離とホスト自動注入の未対応（中2）。
  5. E2E の最終条件に `reviewDone` を含まず、将来の不完全実行が PASS になり得る（中6）。
- **軽微**：
  1. symlink 検証の回帰テスト不足と例外文の質（中5»).
  2. §6.6 の README リスク開示不足（中4').
  3. CLI の未知フラグ処理、宛先 `read` 外部検査の不足など、検証素材の保存不足も軽微に留めます。

次版では、身元固定の reviewer ID リスト、symlink の単体テスト、e2e の `pass` に `reviewDone` を追加するだけで
も、今回指摘の多くは閉じます。
