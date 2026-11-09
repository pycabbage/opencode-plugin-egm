# 実装レビュー 004（プラグイン方式、再レビュー）

- 日付: 2026-11-09
- レビュアー: opencode-go/crouton-alpha-free（OpenCode v2.2.6）
- 対象: レビュー 003 の重大3件・中7件への対処 （src/index.ts、src/permissions.ts、
  tests/unit/plugin.test.ts、 tests/probe/run.ts）
- 結果要約: 新規の重大は無し。重大3件は対応済み。中は 3 件残存（シェル対策の原理的限界、テストの glob 不忠実、 `**/.env.*` 系の漏
  れ）。以下はモデル出力の原文。

---

第3回レビューの重大3件・中7件の対処状況と、ご指定の6点を実コードで確認します。 → Read
docs/design/reviews/2026-11-09-impl-review-003-crouton-alpha-free.md → Read
src/permissions.ts → Read src/index.ts ✱ Glob "src/**/*.ts" in . · 2 matches →
Read tests/probe/run.ts > build · crouton-alpha-free 主要ファイルを確認しました。残りの対処箇所――単体
テスト、検証ロジック、型定義――を続けて確認します。 → Read package.json → Read
tests/unit/plugin.test.ts ✱ Glob "tests/**/*" in . · 5 matches ✱ Glob
"vendor/egm/skills/*/SKILL.md" in . · 7 matches → Read
tests/verifier/verify.ts > build · crouton-alpha-free ✱ Grep "as
never|session\.prompt|transform" in src · 5 matches → Read tests/e2e/run.ts →
Read tests/unit/verifier.test.ts → Read
vendor/egm/skills/egm-brainstorm/SKILL.md ✱ Grep "docs/opencode\.md|Read docs"
in . · 30 matches > build · crouton-alpha-free 前回の確認の続きとして、残りの検証項目を調べます。 →
Read src/permissions.ts ✱ Grep "^description:" in vendor/egm/skills · 14
matches ✗ cd /home/hatch/workspace/opencode-plugin-egm && git log --oneline
-15; echo "---STATUS---"; git status --short; echo "---DIFF STAT HEAD---"; git
diff HEAD --stat failed Error: Executable not found in $PATH: "botid" > build
· crouton-alpha-free → Read src/index.ts → Read tests/unit/plugin.test.ts →
Read tests/probe/run.ts → Read vendor/egm/docs/opencode.md > build ·
crouton-alpha-free ✗ ls ~/workspace/tools/botid* 2>&1; ls /usr/local/bin/botid
2>&1; which bun; bun test tests/unit/plugin.test.ts 2>&1 | head -n 100 failed
Error: Executable not found in $PATH: "botid" > build · crouton-alpha-free >

## レビュー 004: 第3回レビュー(003)の対応確認

レビュアー: `opencode-go/crouton-alpha-free` 対象: `src/index.ts`,
`src/permissions.ts`, `tests/unit/plugin.test.ts`, `tests/probe/run.ts` 結論: **
重大3件は実コード・単体テストレベルでは対応済み**。ただし **中: 残存あり(特にシェル対策の原理的限界、テストの glob 不忠実、
`**/.env.*` 系の漏れ)** のため「問題なし」とは言えない。

## ご指定6点への回答

### (1) `session.prompt` 平坦化: ○

`src/index.ts:135` が `await ctx.session.prompt({ sessionID, text })` の単一引数
flat 形に修正済み。003 の 2 引数 nested 形 `ctx.session.prompt(sessionID, {prompt:{text}}
as never)` は消滅。

`tests/unit/plugin.test.ts:117-125` が `prompts.push()` で記録し `expect("prompt"
in prompts[0]).toBe(false)` と `sessionID`/`text` を assert。対応十分。

### (2) frontmatter `>-` 対応: ○(最小範囲)

`src/index.ts:18-36` が `raw === ">-"` のとき `description:` 行より後の `  ` で始まる行を
`join(" ")` で折り返す処理を実装。vendor 7 スキルのうち 6 件(全件 `description: >-`)が対象で、
`egm-bootstrap` の単行分岐も維持。

`plugin.test.ts:108-116` が `description !== ">-"`、`length > 10`、
`egm-brainstorm` の `Interactive ideation...` 始まりを assert。対応十分。ただし `>`(改行保持)、
`|-`/`|`、クォート付き単行は未対応(現 vendor では不要なため許容範囲)。

### (3) `**/` パターンと grep `.env ask`: △

入っているが漏れあり。

- レビュアー `src/permissions.ts:11-13`、`17`、`20` に `**/.env`、`**/*.env`、
  `**/*.env.*`、`**/AGENTS.md`、`**/CLAUDE.md` が追加。
- プライマリ `:37-38` に `**/*.env ask`、`**/*.env.* ask`、`:42-45` に `grep **/*.env
  ask` 等が追加され「`grep * allow` 後に `grep *.env ask`」の順序(last-match)で上書き。中-2 は型上は解
  消。

漏れ(中):

- `**/.env.local` / `**/.env.*` の明示パターンが無い。レビュアーの `**/*.env.*` で代用する意図が見えるが、ホス
  ト glob で `*` が空文字列にマッチするか、`.*` が `/` を跨ぐかは不明。現単体テストは `effect()`(
  `plugin.test.ts:53-59` )が `.*` で `/` を跨がせ + `basename` フォールバックで match させており、
  ホスト意味論と別物なので証明になっていない。
- プライマリ `read` / `grep` に `**/.env` が無い。レビュアーにはあるのに無いのは不対称で、`**/*.env` が絶対パス
  `/p/.env` を拾えるか実機未証。

### (4) skill/command transform 同期化: ○

`src/index.ts:101-109` で `skills` を transform 前に `await frontmatter()` で読み、
`:110,121` の transform コールバックは `(ed) => { for... ed.add() }` 同期に。
`plugin.test.ts:43-45` の mock も `transform: (fn)=>fn(...)` 同期化。中-1 の race / 二重
I/O / mock 盲点は解消。

### (5) コマンド入力シェルマーカーをコードで拒否: △

`src/index.ts:128` に `/\$\(|/`/.test(args)` による拒否フラグが入り、検出時はスキルを実行せず `was not
run` メッセージを送る形に。中-3 の「プロンプト内の警告のみ」は実コードになった。

ただし:

- `!`+backtick(上流 `vendor/egm/docs/opencode.md:53-55` の正規マーカー) のうち `!` 単体は検出対象
  外。`!`+backtick は backtick で付随的に捕捉できるが、報告内の本文に「`!` 形式とホスト前処理(権限フロー前展開)の残存リスク」
  の注記が無い。プロンプト `Treat...as data, never as shell input` は虚の安心文のまま( `:133` )。
- 拒否分岐の単体テストが `plugin.test.ts` に無い。現テストは正常系のみ。

### (6) ネスト fixture と L1/L2: △

`tests/probe/run.ts:58-64` に `sub/deep/.env`(`NESTED_ENV_SECRET`)、
`sub/AGENTS.md`、`sub/deep/AGENTS.md` を作成し、 `:74-77` で読試行をプロンプト、`:106-115` で
L1=`ENV_SECRET`+`NESTED_ENV_SECRET`、L2=指示ファイル 3 者を分離検証。fixture 追加自体は実施済み。

ただし証明力が弱い(中):

- `verifyRun`( `tests/verifier/verify.ts:97-111` )はマーカー不在のみ見て、要求した各絶対パスの **読試行
  有無 / 拒否ステータス** を assert しない。LLM が読試行しなければ allow でも PASS する。
- 結果がモデル非決定(`--model crouton-alpha-free` ライブ実行)依存。記系の問題(003 の「実機で確認すること」)は充足して
  いない。

## 第3回 中7件の対応判定

- 中-1 async transform
  - 判定: 解消。同期コールバック+事前読込
- 中-2 grep 迂回
  - 判定: 解消(型上)。ただし `**/.env` 漏れ・順序依存が残る
- 中-3 シェル対策
  - 判定: 部分的。コード拒否は入ったが原理的(ホスト前処理)限界 + `!` 注記の欠落が残存
- 中-4 V1 文書先読
  - 判定: 解消。`src/index.ts` に `docs/opencode.md` 先読指示なし。汎用 `docs/ against root`
    のみ
- 中-5 テスト低忠実
  - 判定: 部分的。同期 mock・prompt 記録・description assert は改善。`effect()` の `.*` 跨ぎと
    basename フォールバックが重大-3 の盲点を温存。シェル拒否分岐未テスト
- 中-6 手書き frontmatter
  - 判定: 部分的。`>-` の最小対応で vendor 6 件は救済済み。YAML 汎用への耐性は未対応
- 中-7 MCP 明示 deny
  - 判定: 部分的。レビュアー `read mcp:* deny` 追加済み。プライマリ `read * allow` による暗黙許可は残存

## 残存・新規の問題

### 重大: 新規は無し。ただし現残存の組み合わせは「リリース可」には下げる水準

- `effect()` がホスト glob と別物のまま。`tests/unit/plugin.test.ts:53-59` による `.*` 跨ぎ +
  basename フォールバックは、実ホストが `*` を `/` 非跨ぎ・`.*` なしと仮定する現状を反転させる。`fixtures` の deny
  は unit + probe(マーカー不在のみ)では証明されておらず、重大-3 の解法は「書き方は正しいが検証が弱い」。最低限 `**` 単体・`*`
  単体を host 相当の matcher で替えるか、`glob` 系許可表を保持する検証が要る。

### 中

1. **中A: `**/.env*` 変種漏れ** — `src/permissions.ts` に `**/.env.*` が無い。
   `/p/sub/deep/.env.local` が `**/*.env.*` で拾われるか未証。`plugin.test.ts:79` の
   `/p/sub/deep/.env.local` deny が通っているのは `effect()` の限界で、実ホスト保証になっていない。
2. **中B: イグジットスライム投機のシェル対策原理限界** — 拒否したつもりでもホスト `!`+backtick 展開は `execute` 前に完
   遂済み。現在の `was not run` メッセージは「実は実行済みかもしれない」を警告していない。
3. **中C: プライマリ MCP** — レビュアーのみ `read mcp:* deny`。プライマリ `read * allow`(
   `permissions.ts:34` )で `mcp:*` を拾う余地が残る。設計意図(deny/ask)不明のまま放置。

### 軽微(003 未対処)

- `src/index.ts:25` の `match(... )!` の non-null assert( `name` 欠落時に plugin
  load 直死、`TypeError`)、`:101-108` の `SKILL.md` 欠落 dir 時の throw(try/catch・skip
  なし)、`:47-50` / `:106-108` の逐次 await(初期化遅い)。
- `Row` 型は `allow|deny|ask` に狭められたが、 `index.ts:118` の `skill.add({... } as
  never)` と `plugin.test.ts:48` の `ctx as never` の型逃し残存。`@file` 添付の `files` 落と
  し `(prompt as {text?})`(`index.ts:127`)も未決。

問題が無い箇所(1)(2)(4)以外の重大3件は動作としては通過可能だが、上記中A〜Cが残る限り「問題なし」とは言えない。
