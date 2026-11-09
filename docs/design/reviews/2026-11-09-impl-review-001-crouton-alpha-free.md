## 総評

src/ 配下 5 ファイルと `tests/` を読了し、`bun test` も実行しました（17 tests passed）。

- **重大：確認されず。** reviewer の権限表（`src/permissions.ts`）はワイルドカード deny を先頭に置く正しい順序を取っており、直接書込み・シェル・委譲の迂回はコードからは確認できません。
- **中：5件**、**軽微：5件** がありました。

## 中

1. **起動前検査（check.ts）の未カバー範囲 — 権限モデル（permissions.ts 重大抜けなし、check.ts 中）**
   reviewer の実効権限は `permissions.ts` で `* deny` で始まっているため生成物自体は安全ですが、`check.ts:33-48` の reviewer 期待は `edit/bash/shell/subagent/webfetch/skill/grep/read/glob` のみで、設計 §6.4 が棚卸しを求めている `write` / `websearch` / `question` / Code Mode `execute` / MCP 専用アクション / `external_directory` は検査対象外です。利用者設定マージでこれらのアクションだけ allow されても起動前検査は通ります。
   また `check.ts:89-95` は `subagent` として登録された ID を読むだけなので、レビュアーが 8 名でなくても（例：1名欠落）起動を拒否しません（9エージェント構成の明示確認が無い）。設計 §6.5 の「想定リストと機械突き合わせ」にまだ届いていません。

2. **AGENTS.md / CLAUDE.md ガードの basename 仮定 — L2 分離（permissions.ts/check.ts、tests/unit/permissions.test.ts）**
   `permissions.ts:73-117` の `evaluatePermissions` は「リソースパターンは basename にも一致する」独自意味論を実装し、単体テストはこれで `/proj/AGENTS.md` が deny になると検証しています。しかし Phase 0（`phase0-results.md` D2）は glob/順序の確定までで、basename 一致の有無は確認していません。ベアの `"AGENTS.md"` / `"CLAUDE.md"` パターンはホストの glob 意味論次第で絶対パスに一致せず、実運用では `/proj/AGENTS.md` を読める可能性があります。
   `check.ts:46-47` も期待入力が相対パス（`AGENTS.md`, `docs/CLAUDE.md`）のみで、絶対パスでの実効確認がありません。ホストの自動注入（§7.3）も read 権限では防げず、ランチャー（generate.ts:211-222）は XDG 分離も持ちません。README はこれを制限事項として開示しているため重大化は避けましたが、L2 証跡として現状は弱いです。

3. **§6.4 の対象文書/prior report 許可リスト形式が未実装（generate.ts/permissions.ts）**
   `permissions.ts:42-43` は `external_directory` を bundle のみ許可し、設計 §6.4 の「生成時に対象文書と prior report の絶対パス（ファイル単位）」の許可追加がありません。プロジェクト外に置いた対象文書をレビュアーが読む経路がありません（ファイル内容注入で代替する方式は不変条件 3 に反します）。README の標準経路（プロジェクト内文書）では発現しにくい機能欠陥です。

4. **§6.6 のコマンド引数安全規定が生成物に落ちていない（generate.ts、e2e）**
   コマンドは `generate.ts:193-197` で `Run ${skillName}` と `$ARGUMENTS` をそのまま渡し、絶対パス限定・シェルマーカー検出時の停止・ファイル経由指示は生成プロンプトにもありません。`tests/e2e/run.ts:157,171` は逆に `/egm-draft concepts_brief.md を基に…` のような相対パス＋自由文でコマンドを呼んでおり、設計 §6.6 自身の規約と衝突しています。

5. **宛先検証の symlink バイパス（generate.ts:64-84）**
   `validateDestination` は `if (existsSync(...))` の内側でのみ `lstat` するので、ターゲット不在の dangling symlink 宛先は拒否をすり抜け、後続の `mkdir(bundleRoot)` でリンク先にツリーを作成します。親ディレクトリがリンクの場合は `resolve()` のレキシカル処理＋最下位コンポーネントのみの確認で、リンク先の本当の配置先（ソースツリー内部など）を検出できません。設計 §6.3 の「宛先 symlink 拒否・ソースツリー内生成拒否」を完全には満たしていません。

6. **検証側の期待値が自明に通る（tests/e2e/run.ts、tests/probe/run.ts）**
   - E2E は `e2e/run.ts:186-191` で検証対象の reviewer を「実際に派遣されたもの」から作るため、派遣数が不足しても `verifyRun` は通り、不足分は表示だけです（設計 §8 の 7名〜8名期待に対して貧弱）。
   - probe は `probe/run.ts:122-126` で親マーカー/L2 指示マーカー/.env 内容を1つの検証に混ぜており、設計 §7.4 の「L1 と L2 の結果を分けて報告」と逆に、どちらが漏れたか切り分けられません。

## 軽微

1. **ランチャーのシェルインジェクション余地（generate.ts:211-221）**：宛先パスは `DEST="${dest}"` 等に無加工挿入され、禁止文字リスト（`generate.ts:58`）は `;`・`"`・`'`・空白を含みません。宛先に `"` を含めるとランチャーが壊れ/注入します。インストール者自身の選択パスが前提なので影響は限定的です。

2. **URL pathname のエンコード（generate.ts:225、cli.ts:18）**：`new URL(...).pathname` をそのまま `join` で使うため、空白や日本語などを含むパスでは `%20` のままになり、チェックコピー/デフォルト vendor 解決が失敗します。`fileURLToPath` を使うべきです。

3. **verifier の許可ツールと権限の不一致（tests/verifier/verify.ts:112-118）**：verifier は `list` を許可しますが、権限自体は `read`/`glob` のみ allow し `list` はワイルドカード deny です。

4. **CLI の引数解釈（cli.ts:24-32）**：`install <dest> [--egm ...]` で `--egm` の値が `args.find(a => !a.startsWith("--"))` で dest と誤認されたり、値なしで `resolve(undefined)` が不明瞭なエラーになります。

5. **README の数値/参照不一致**：preflight 期待値は現コードではレビューアー 14件×8 + プライマリ 15件 = 127件にもかかわらず「108 expectations」と記載され、参照する `docs/verification/verification-2026-11-09.md` が存在しません。生成物・テストの動作には影響しません。

## 良い点（明確に確認できた範囲）

- reviewer の deny→read/glob allow→例外 deny の順序、`*.env.example` の再 allow、grep deny、外部ディレクトリ bundle 制限、primary の subagent 8名限定・`egm-*` スキル限定は設計どおりです。
- インストール先が既存なら拒否、`*.env.` 含むパス拒否、生成設定とエイリアスリンク先を含む `installation.json` の全ファイルハッシュ（`manifest.ts:46-65`）も実装どおりです。
- `bun test` は現状すべて通ります（17 pass）。

「重大な権限迂回が無い」ことは確認できましたが、起動前検査の完全性、L2 側の basename 前提、外部文書許可リストの未実装、宛先 symlink バイパスは対処を推奨します。
