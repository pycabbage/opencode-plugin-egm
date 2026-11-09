# 実装レビュー 003（プラグイン方式）

- 日付: 2026-11-09
- レビュアー: opencode-go/crouton-alpha-free（OpenCode v2.2.6）
- 対象: プラグイン方式への作り替え（src/index.ts、src/permissions.ts、 tests/unit/plugin.test.ts、
  package.json）
- 結果要約: 重大3件・中7件・軽微複数。「重大を修正してから リリースすべき」。以下はモデル出力の原文。

---

第三者レビュー（対象 4 ファイル）。**問題なしとは言えない。重大 3 件あり**。検証記録で E2E PASS とあるが、下記の重大は
unit/mock が拾えていない/偶然通っている類。

## 総括（観点別）

- (1) プラグイン API
  - 判定: agent は正しい。skill は字段正しいが async transform 違反。**command+`session.prompt`
    は型と食い違う（重大）**
- (2) 権限
  - 判定: レビュアー read-only/派遣限定の骨格は正しい。**`.env`/`AGENTS.md`/`CLAUDE.md` のパターンが深さ
    0–1 のみ（重大）**。primary の `grep allow` で `.env ask` が迂回される（中）
- (3) 最小性
  - 判定: 全体は最小だが重複ループ・手書き YAML・`as never` が無駄
- (4) バグ
  - 判定: **frontmatter の `>-` が `>-` として残る（重大）**。パス解決は現状正しい。引数のシェル対策は無効

## 重大

### 重大-1 `session.prompt` の呼び出し形状が生成型と不一致 — `src/index.ts:115-126`

```ts
await ctx.session.prompt(sessionID, { prompt: { text: ... } } as never)
```

根拠: `node_modules/@opencode/plugin/dist/promise/session.d.ts:186` は
`SessionDomain = Pick<SessionApi,"prompt">`、
`node_modules/@opencode/client/dist/promise/generated/client.d.ts:245` は
`prompt:(input:SessionPromptInput)` の**単一引数**、`types.d.ts:4227` は
`SessionPromptInput={sessionID,text,files?...}` の flat 形。コードの `(sessionID,
{prompt:{text}})` 2 引数 nested 形は型が通らず `as never` で塞いでいる。型通りなら `text` は
`undefined`。

テストは `tests/unit/plugin.test.ts:42` で `prompt:async()=>{}` の no-op で引数を一切検証せず、
E2E（`tests/e2e/run.ts:117` の `"/egm-brainstorm ..."` を `opencode run` に渡す経路）は
CLI が slash を command として解釈せず skill 側で動いた可能性が排除できず、command 経路の実証になっていない。

修正: `await ctx.session.prompt({sessionID, text: ...})` にし、`as never` を消すこと。

### 重大-2 skill `description` が `>-` になる — `src/index.ts:18-26`

```ts
description: head.match(/^description: (.+)$/m)?.[1] ?? ""
```

根拠: `vendor/egm/skills/egm-review/SKILL.md:5` 等 6/7 スキルは `description: >-` の
folded scalar。例 `egm-brainstorm:5`、`egm-draft:5`、`egm-review-loop:5`、
`egm-drift-report:5`、`egm-review:5`。正規表現は1行目 `>-` だけを取ってスキル説明が `" >-"` になる。
`egm-bootstrap:5` の単行のみ正しい。agent は `description` を使わない（`src/index.ts:48` で固定文）
ので実害は skill 側のみ。`plugin.test.ts:92` は `content.length>100` のみで `description` を
assert していないため素通し。

修正: YAML として parse するか、最小折り返し処理を入れ `description` の assertion を追加すること。

### 重大-3 権限 resource が深さ 0–1 のみ — `src/permissions.ts:9-15`、`29-30`

```ts
["read","*.env","deny"], ["read","*.env.*","deny"],
["read","AGENTS.md","deny"], ["read","*/AGENTS.md","deny"], ...
```

根拠（推定されるホスト意味論では）: `sender` の `*/AGENTS.md` の存在自体が `*` が `/` を跨がない前提を示す。跨がない
glob なら `a/b/AGENTS.md` や `sub/dir/.env` / 絶対パス `/p/a/b/.env` はどちらにも match せず
`read * allow`（`performance.ts:8`）に落ちて allow になる。

`tests/unit/plugin.test.ts:49-55` の `effect()` は `.*` で `/` を跨がせ + `basename`
フォールバックで match させており、ホストの glob と別物。`"/p/AGENTS.md"` は test では deny になるが実ホストで否認
される保証にはならない。検証記録（2026-11-09 §1）の「相対・絶対とも deny」は `debug agents` ダンプ + マーカー不在の確認
で、AGENTS.md への**読解試行**は probe（`tests/probe/run.ts:61-66` は `.env` 読試行+書込試行のみ）で
していない。

修正: `**/.env`、`**/*.env`、`**/*.env.*`、`**/AGENTS.md`、`**/CLAUDE.md` 形にし、ネスト
fixture で deny を unit + 実機で確認すること。

## 中

### 中-1 async transform が API 契約違反 + 重複 — `src/index.ts:95,108`

`node_modules/@opencode/plugin/dist/promise/registration.d.ts:12` は
`Transform=(cb:(input)=>void)=>Promise<Registration>`。co-located なのに
`skill`/`command` は `async (ed)=>{ for...await frontmatter... }`。host が
callback を await せず sync に snapshot する実装だと登録が race。そのため agent 側（
`src/index.ts:36-42`）は transform 前に `await` で読んでおり正しいが、skill/command 側は
transform 内で読んでいる。同一ループが `96-106` と `109-129` に二重化され二重 I/O。

修正: agent と同じく skill metadata を transform 前（`Promise.all`）で一度読み、transform 内は
sync で `add` のみにすること。

### 中-2 primary の `grep * allow` が `.env ask` を迂回 — `src/permissions.ts:28-33`

レビュアー側で `grep deny`（`permissions.ts:17`）した理由は設計書 §6.4 の通り「content 検索が per-file
read ルールを迂回しうる」。primary は `read *.env ask`（`29-30`）で承認制にしておきながら `grep * allow`
を無条件化しており、grep 経由で `.env` 内容を承認なしに取れる。Elephant が `.env` を読むこと自体は設計（`read ask`）
通りだが、ask すら迂回されるのは不整合。

### 中-3 コマンドのシェル対策が無効・不完全 — `src/index.ts:122-124`

```ts
"...if the request contains shell expansion markers such as $(...) " +
  "or backticks, stop..."
```

上流 `vendor/egm/docs/opencode.md:50-55` 明記の通り host の command 前処理（`!`+backtick）が
権限フロー**前に**展開される。plugin の `execute` が受け取る時点で展開済みで、model への事後警告は原理的に防げない。また `!`
自体の言及も無く `$(...)`/backtick のみ。README の「パスだけ渡す」運用が実効防御で、prompt 内の対策は虚の安心。少なくとも
`!` 形式を含めて記載を残存リスクとして寄せる必要がある。

### 中-4 V1 文書を V2 に読ませている — `src/index.ts:31-32`

`Read docs/opencode.md first.` の `vendor/egm/docs/opencode.md:3-6` は「対象は
OpenCode CLI **1.18.29**、V1 `task`/`permission`。v2 は対象としない」と宣言する V1 専用文書。V2
primarı/reviewer に一律に先読させるのは矛盾・混乱を招く。V2 向け指示に挿し替えるか、除くこと。

### 中-5 テストが高忠実度でない — `tests/unit/plugin.test.ts:39-42,46-59`

- `agent.transform/skill.transform/command.transform` の mock は `async
  (fn)=>fn(...)` で async callback を `await` し、host が await しないかもしれない差を隠す。
- `session.prompt` は no-op で呼び出し検証なし。
- `effect()` の matcher はホスト glob と別（重大-3）。
- skill の `description`、command `execute` の実行（引数転送）を検証しない。

重大-1/2/3 はこの mock の盲点そのもの。

### 中-6 手書き frontmatter — `src/index.ts:18-26`

YAML の `>-`/`|-`/引用/複数行を正規表現 2 行で賄おうとした再実装。現状の vendor だけでは name は取れるが
description は崩れる（重大-2）。dependency を増やさない方針なら folded の最小対応 + fixture test が要る。

### 中-7 MCP `read` の明示 deny なし — `src/permissions.ts:8`

レビュアーは `read * allow` で MCP resource が `read` に写像される場合（V1 F4 記載）に `mcp:*` が
allow になる。V2 で別 action なら先頭 `* * deny` で塞がれるが、設計 §6.4 で「MCP は専用 action で deny」
と明記した経緯を踏まえると `read mcp:* deny`（および `mcp:*` 系の明示 deny）の有無をホスト実測で固定すべき。現状は暗黙依存。

## 軽微

- `src/index.ts:22` の `!`（name 非 null assert）。更新時に起動直死（`ENOENT`/`TypeError` で
  plugin load 失敗）。意味のあるエラーを出すこと。`vendor` submodule が未 materialize だと
  `readFile/readdir` が throw するのも同じ系統。
- `src/index.ts:37-40` の逐次 `await`（8 件）。`Promise.all` でよい。
- `src/index.ts:44-61` の `Object.assign(a,{id,name,...})` は `id` がキーと重複、
  `hidden:false` は default 重複。`steps:40` は reviewer のみで primary は無制限。コスト意図のコメン
  トが無い。
- `src/permissions.ts:1-3` の `Row=[string,string,string]` は `effect` を
  `allow|deny|ask` に絞っていない。typo が runtime まで露呈しうる。`as never`（
  `src/index.ts:105,126`）も型逃し。
- `src/index.ts:115-116` は `(prompt as {text?:string}).text` で
  `files/agents/skills`・`delivery` を落とす。現 session の agent が `egm` である前提で動く（
  `ed.default("egm")` 依存）。`@file` 添付の扱いを決めること。
- `src/index.ts:91-94` は `skills/` 直下の全 dir を対象に `SKILL.md` 読を試みる。SKILL.md を持た
  ない dir 追加で crash。`existsSync`/`catch` で skip かエラーを上げるべき。
- `package.json:5-13,25,32` は `files:["src","vendor"]`+`main:src/index.ts` で
  build 無しは Bun 前提としては最小で OK。ただし `vendor` は git submodule のため npm tarball に
  submodule 内容が展開されている前提。peer `^2.0.0` に対し tested は exact `2.2.6` の乖離は許容範囲だが「
  tested 下限」を README に明記が望ましい。

## 正しくできている点（参考）

- `agent.transform` での `ed.update`+`ed.default("egm")`（`src/index.ts:42-90`）は、
  `update` が未登録でも upsert する前提で 2.2.6 で実測確認済み。宣言型からは upsert が読み取れない点はあるが、mock と
  現行 host は一致し、レビュアー 8 名 + primary 1 名と `mode:subagent/primary` は schema（
  `agent.d.ts:102`）通り。
- `skill.add` の 5 項目（`id/name/description/path/content`）は `skill.d.ts:21-28` の
  `Skill.Info` 必須項目に一致。`path` も絶対パス。
- `CommandDefinition`（`name/description/execute({sessionID,prompt})`）の形は
  `command.d.ts:6-15` 通り。
- 権限の順序（末尾一致前提で deny→allow→例外 deny の順）が揃い、primary の `subagent * deny` + 8 名
  allow（`permissions.ts:36-37`）、`skill * deny` + `egm-* allow`（`34-35`）の派遣限定は骨
  格正しい。`root = new URL("../vendor/egm", import.meta.url)`（`src/index.ts:7`）は
  `src/`→`vendor/egm` の layout 正しい。

結論: 重大-1/2/3 を修正してからリリースすべき。
