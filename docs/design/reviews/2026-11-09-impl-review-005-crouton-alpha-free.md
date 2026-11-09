# 実装レビュー 005（型アサーション除去）

- 日付: 2026-11-09
- レビュアー: opencode-go/crouton-alpha-free（OpenCode v2.2.6）
- 対象: rules 変換・Object.assign・全型アサーションの除去（src/index.ts、
  src/permissions.ts、tests/**、tsconfig.json、package.json）
- 結果要約: 重大は無し。中2件（Skill.Info デコードの失敗が setup 全体を止める、
  files 転送がテストで固定されていない）は対処済み。以下はモデル出力の原文。

---

**No majors found** — agent/skill/command registration values, permission
sets, and row order are preserved (verified: 43 permission rows in identical
order, same agent fields, same skill fields, same prompt forwarding value).
`tsc --noEmit` (exit 0) and `bun test tests/` (21 pass) confirm.

## Medium

- **src/index.ts:118** — `Schema.decodeSync(Skill.Info)` is the only new throw
  path in setup. Old `as never` deferred validation to the host; a schema
  mismatch now aborts `setup` after agents have already been transformed (line
  56), leaving skills/commands unregistered. Unreachable with current vendor
  inputs (`frontmatter` guarantees strings + absolute `path`), but a future
  bad `SKILL.md` fails the whole plugin fail-fast instead of being isolated
  per-skill.
- **tests/unit/plugin.test.ts:120-130, 273-276** — `ctx.session.prompt` double
  records input without validating the `SessionPromptInput` contract, and the
  command test only uses `PromptInput.Prompt.make({text})` (no `files`).
  Dropping `files` forwarding in `src/index.ts:135` would still pass. The
  assertion `Object.keys(sent).not.toContain("prompt")` catches nested-prompt
  regression but nothing locks `files: FileAttachment[]` forwarding (the type
  change from `string[]` to objects).

## Minor

- **Type-hole remaining (cast → annotation, same unsoundness):**
  `tests/e2e/run.ts:72,78`, `tests/probe/run.ts:48,54`,
  `tests/verifier/verify.ts:137` — `const parsed: {...} = JSON.parse(...)` /
  `const exp: SessionExport = JSON.parse(...)` assigns `any` without
  validation, identical in effect to the removed `as` casts. A CLI shape
  change now surfaces as a downstream `?? 0` / "could not identify parent"
  diagnostic rather than a JSON error; harness-only, not shipped code.
- **src/index.ts:2, tests/unit/plugin.test.ts:12-15** — direct imports
  `effect` and `@opencode/schema/*` are undeclared in `package.json` (only
  `devDependencies: @opencode/plugin`). Resolves via transitive hoist in this
  repo (Bun/npm flat); would be `MODULE_NOT_FOUND` under an isolated/pnpm
  install. Prefer declaring them or re-exporting via `@opencode/plugin` where
  possible.
- **src/permissions.ts:1-5** — local `Row` duplicates `Permission.Rule`
  (`action/resource/effect`). Assignment to `a.permissions` is still checked
  (`tsc` passes), but a future required `Permission.Rule` field would only be
  caught at this assignment site, not at the helper's definition.
- **tests/verifier/verify.ts:46** — `isToolPart(part: {type:string}): part is
  ToolPart` is an unchecked narrowing equivalent to the old `as ToolPart`. A
  malformed part missing `name/state` yields `undefined` downstream (safe via
  `?.`), but it is still a type predicate hiding shape mismatch.
- **tests/e2e/run.ts:9, tests/probe/run.ts:9** — `process.argv[... + 1] ??
  "opencode-go/crouton-alpha-free"` silently defaults when `--model` is passed
  without a value (old `!` would pass `undefined` and fail loudly). Masks CLI
  misuse in CI.
- **src/index.ts:134-135** — `prompt.text` vs old `(prompt as
  {text?:string}).text ?? ""`: if a non-conforming host ever omitted `text`,
  new code coerces `undefined` to `"undefined"` in `RegExp.test` and the `User
  request:` template vs old `""`. `PromptInput.Prompt` guarantees `text:
  string`, so not observable with a conforming host; noted only for
  completeness.
- **Test-double strictness (overall improvement, residual gaps):**
  `tests/unit/plugin.test.ts:30-37` `agentEditor.update` auto-creates a draft
  for unknown ids and `46-47` `skillEditor.update/remove` are no-ops, so a
  wrong-editor call would be masked. The new `stub: () => never` (line 18)
  otherwise throws on unexpected `Context` calls — strictly better than the
  old minimal ctx — but does not prove host dispose/lifecycle behavior
  (`registration` lines 57-71 ignored by plugin by design).

## Verified non-issues (behavior preserved)

- `src/permissions.ts:7-54` vs HEAD: row-for-row identical, including
  `${bundle}/**` stays last in both lists.
- `src/index.ts:59-97`: direct assignments set the same 9 fields (reviewers) /
  8 fields (`egm`, no `steps`) in the same order as the old `Object.assign`;
  brand makers are runtime identities.
- `src/index.ts:24`: `lines[at]?.slice(13) ?? ""` ≡ old `at < 0 ? "" :
  lines[at]!.slice(13)`.
