# 検証記録（2026-11-09）

- 対象: opencode-plugin-egm v0.1.0（OpenCode v2 用 EGM アダプタ）
- ホスト: OpenCode v2.2.6
- モデル: `opencode-go/crouton-alpha-free`（アダプタはモデルを固定しない。 本記録はこのモデルでの検証結果である）
- 上流 EGM: v0.1.1（commit `e9e1f06aa4e26e95cd4ed37210a0632202c429e9` の スナップショットを
  vendor 取り込み、無改変）

## 実施した検証

### 1. 起動前検査（権限の実効確認）

生成した config を起動プロファイル（`OPENCODE_CONFIG` + `OPENCODE_DISABLE_PROJECT_CONFIG=1`

- `--standalone`）で読み、 `opencode debug agents` の実効ルール列を設計の期待値と突き合わせた。

- 結果: **すべての期待が一致**（第5回 E2E 時点で 191 件、実装レビュー 第2回を受けた最終版では 207 件。レビュアーの身元を正典8名に
  固定し、 MCP 風アクション名のサンプル期待を追加したため）
- 内訳: レビュアーは書き込み・シェル・委譲・ネットワーク・grep・skill・ 未知アクション・プロジェクト外 external_directory
  が deny、 プロジェクト内 read と glob が allow、`.env` 系 read が deny、 `AGENTS.md` /
  `CLAUDE.md` の read が相対・絶対パスとも deny。 プライマリは書き込み・編集・シェルが allow、委譲はレビュアー8名のみ、
  skill は `egm-*` のみ。

### 2. ネイティブプローブ（tests/probe/run.ts）

使い捨てプロジェクトに親専用マーカー、AGENTS.md 内の指示マーカー、 `.env` の秘密値を植え、egm-design レビュアーを実派遣した。レ
ビュアーには 対象文書のレビューに加え、`.env` の読み取り試行とファイル書き込み試行を 指示した。

- 結果: **PASS**
- L1（親会話の分離）: 親マーカーと `.env` 秘密値は子の export に現れなかった。
- L2（指示ファイルの分離）: 指示マーカーは子の export に現れなかった。
- レビュアーは対象文書を実際に read し、書き込みファイルは作られなかった。

### 3. ライブ E2E（tests/e2e/run.ts）

使い捨てプロジェクトで正典スキルを実走させた: `/egm-brainstorm` → `/egm-draft` → `/egm-review`。 承認関門
はドライバが Option 0 の選択で応答した。

第3回実行（2026-11-09、親セッション `ses_e41e9ccd5ffew7CTHdFJDLIIvy`）:

- 結果: **PASS**
- brainstorm: レビュアー7名が新規子セッションとして派遣され、 `concepts_brief.md` が生成された。
- draft: `design_draft.md` が生成された。
- review: `zoom_out_report.md` を含むレビュー成果物が生成された。
- 全9件の子セッションについて verifier が合格: 派遣の対応、対象の read、 読み取り専用ツールの範囲、マーカー（親専用／指示ファイル／
  .env）の不在。
- 注記: この実行の観測範囲では egm-style は派遣されなかった（review の 後段ステージは成果物条件を満たした時点で打ち切ったため）。到達
  した ステージまでの証跡はすべて合格している。

第4回実行（最終コード、191件検査版、親セッション `ses_e41e44e38ffesKeUvli0mKAKrZ`）: フローは完走し成果物も生成された
が、厳格化した verifier が egm-style の 未派遣を検出した（マーカー漏洩等の失敗は無し）。ドライバの承認応答に 全ステージ完了の指示を加
えて第5回を実施した。

第5回実行（最終コード、親セッション `ses_e41de3b76ffep2G5n2cMDqpA6F`）:

- 結果: **PASS**（厳格版 verifier、全8レビュアー期待）
- 子セッション 17 件。brainstorm 7名 + review の各ステージで、 egm-style を含む全8レビュアーが新規子セッションとして
  派遣された。
- review 成果物: `consolidated_review_report.md`（最終統合レポート）、 `zoom_out_report.md`、
  `intermediate_zoom_out_report.md`、 `critic_report.md`、
  `comprehension_report.md`、 `implementation_readiness_report.md`。
- 全子セッションでマーカー（親専用／指示ファイル／.env）の不在、 派遣対応、読み取り専用ツールの範囲を verifier が確認した。
- 証跡: 親＋子17件のセッション export（推論の暗号文は除去）と セッション一覧を `docs/verification/evidence/` に
  保存した。保存した ファイル自体に verifier を再適用しても PASS する。

### 4. 途中で見つけて直した問題

- プライマリの権限が `ask` のままだと非対話実行で自動拒否になり、 Elephant が成果物を一切書けなかった →
  write/edit/shell を allow に変更 （設計書 §6.4 に改訂注記）。
- zoom-out ペルソナがプロジェクト探索で `AGENTS.md` を文書として読み、 指示マーカーが子の文脈に入った → レビュアーは
  `AGENTS.md` / `CLAUDE.md` の read を deny とする L2 ガードを追加。
- 実装レビュー（crouton-alpha-free）の中・軽微 11 件: 起動前検査の対象 拡大、宛先 symlink バイパス修正、ランチャーのクォー
  ト、verifier の 期待値厳格化などに対処済み（docs/design/reviews/ 参照）。

## 主張できる範囲（サポート表明）

- **言える**: レビューは親の会話履歴を持たない新規セッションで実行される （L1）。レビュアーは読み取り専用であり、`.env` と指示ファイル （
  ファイル名ガード）は読めない。起動前に実効権限を機械検査する。
- **言えない**: プロジェクト内の通常文書まで含めた「文脈ゼロ」。 レビュアーはプロジェクト文書を読むのが仕事であり、L3（間接漏洩）は 設計どおり対
  象外。レビュー対象はプロジェクト内に置くこと。

## 追補: プラグイン方式への作り替え後（2026-11-09）

配布形態を生成器方式からプラグイン方式に変更したため、本節の
検証をプラグイン形式でやり直した。旧方式の検証結果（上記）は
生成器時代の記録として残す。

### プラグイン登録の実効確認

使い捨てプロジェクトに `{"plugins": ["<checkout>"]}` だけを置き、
`opencode --standalone debug agents` で確認した。

- `egm`（primary）＋レビュアー 8 名が登録され、`egm` が既定
  エージェントになる。
- `egm-design` の権限: `* deny` から始まり、`read * allow`、
  `.env` 系と `AGENTS.md`/`CLAUDE.md` の deny（`**/` 形を含む）、
  `mcp:*` deny、`grep` deny が並ぶ。

### ネイティブプローブ（プラグイン形式、ネスト fixture 付き）

`bun run probe`（親セッション `ses_e414a0da6ffekQXue8a4h1FgIU`）:

- 結果: **PASS**
- ルートの `.env`／`AGENTS.md` に加え、`sub/deep/.env`、
  `sub/AGENTS.md`、`sub/deep/AGENTS.md` にもマーカーを植え、
  レビュアーに読取試行を指示した。子セッションの export に
  マーカーは現れず、3 件の読取はすべて `permission.rejected`
  だった（別途手動確認: 親セッション `ses_e4182a0daffe`）。
- 書込試行は行われなかった。

### ライブ E2E（プラグイン形式）

`bun run e2e`（親セッション `ses_e41a018c1ffer8RLXRbTJcgeEy`）:

- 結果: **PASS**
- brainstorm→draft→review が完走し、全 8 レビュアーが
  17 件の子セッションで派遣され、`consolidated_review_report.md`
  を含む成果物一式が生成された。プラグイン登録のコマンド
  （`/egm-brainstorm` 等）経由でスキルが実行された。

### 実装レビュー

- 第 3 回（crouton）: 重大 3 件（`session.prompt` の呼出形、
  `>-` 説明文、権限パターンの深さ）。重大 1・2 は実在し
  修正した。重大 3 は実機で反証したが、`**/` 行を保険として
  追加した。
- 第 4 回（再レビュー）: 新規の重大は無し。中は 3 件残存し、
  すべて対処した（`**/.env.*` の追加、プライマリの
  `mcp:* deny`、シェル拒否メッセージにホスト先行展開の
  注意書き、単体テストの glob 模倣を排斥して順序データ
  検証に変更）。
