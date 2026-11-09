# opencode-plugin-egm

An **experimental** adapter that runs [EGM (Elephant-Goldfish Model)](https://github.com/google/elephant-goldfish-model)
on **OpenCode v2**. EGM's canonical skills, reviewer personas, and document
standards are vendored unmodified (`vendor/egm/`, Apache-2.0); this project
adds the OpenCode v2 wiring around them: a generated config with one primary
orchestrator agent (`egm`) and eight read-only reviewer subagents, so every
review is performed by a fresh session with parent-conversation isolation —
a "Goldfish" that reads the target itself and cannot write, run shells, or
delegate further.

Design and evidence:

- Design: [`docs/design/opencode-v2-adapter-design.md`](docs/design/opencode-v2-adapter-design.md)
- Phase 0 spike results (D1–D7): [`docs/design/phase0-results.md`](docs/design/phase0-results.md)
- Verification record: [`docs/verification/verification-2026-11-09.md`](docs/verification/verification-2026-11-09.md)

## Requirements

- OpenCode v2 (verified against 2.2.6)
- [Bun](https://bun.sh) (generator, preflight check, tests)
- POSIX symbolic links

The adapter does not fix a model. Verification was performed with
`opencode-go/crouton-alpha-free`; use any model your OpenCode can run.

## Install

```sh
git clone https://github.com/pycabbage/opencode-plugin-egm
cd opencode-plugin-egm
bun install
bun run src/cli.ts install ~/.local/share/egm-opencode
```

The destination must not exist. The generator refuses destinations that
exist, are symlinks, contain glob/template characters, match the `.env`
read rules, or sit inside the source tree. It writes:

| Path | Contents |
| --- | --- |
| `bundle/` | Canonical EGM trees (skills, agents, resources, docs) |
| `skills/` | Aliases to the canonical skill directories |
| `opencode.json` | Generated OpenCode v2 config (agents, commands, skills) |
| `installation.json` | SHA-256 manifest of everything installed |
| `check.ts`, `permissions.ts` | Preflight permission check (self-contained copy) |
| `egm-opencode.sh` | Launcher (preflight check, then OpenCode) |

Verify an install at any time:

```sh
bun run src/cli.ts verify-manifest ~/.local/share/egm-opencode
bun run src/cli.ts check ~/.local/share/egm-opencode /path/to/your/project
```

## Use

From your project directory:

```sh
~/.local/share/egm-opencode/egm-opencode.sh /path/to/your/project
```

The launcher starts OpenCode with the adapter profile
(`OPENCODE_CONFIG=<install>/opencode.json`, `OPENCODE_DISABLE_PROJECT_CONFIG=1`,
`--standalone`, `--agent egm`) after the preflight check passes. Your own
OpenCode config files are never modified. Note that while an EGM session is
running under this profile, your project-level OpenCode config is not merged;
the preflight check compares the *effective* permissions against the design
and refuses to start on mismatch.

Commands inside the session:

| Command | Skill |
| --- | --- |
| `/egm-brainstorm` | Explore a design space with seven fresh reviewers |
| `/egm-draft` | Draft a design doc section by section |
| `/egm-review` | Five-stage staged review of a document |
| `/egm-review-loop` | Review → fix → re-review until clean |
| `/egm-resolve` | Resolve reviewer findings with the author |
| `/egm-drift-report` | Report drift between docs and code |
| `/egm-bootstrap` | Guided project bootstrap (see limitations) |

Review inputs are passed as ordinary messages with absolute file paths.
Approval gates are part of the canonical skills and are preserved.

A note on slash commands: OpenCode expands command arguments on the host
side before the agent sees them, and no prompt-level instruction can
change that. The commands are a convenience entry point; for sensitive
review inputs, prefer an ordinary message with absolute paths (the
design's standard input route), and pass documents as files rather than
pasting their contents into a command argument.

## How isolation works

- Reviewers are separate subagent sessions created fresh for every dispatch
  (`parentID` links them to the orchestrator; no session is reused).
- Reviewer permissions: everything denied except reading project files and
  the bundle (`.env` reads denied, `grep` denied because content search can
  bypass read rules, no shell, no writes, no further delegation).
- The orchestrator may dispatch only to the eight registered reviewers and
  may use only `egm-*` skills.
- `tests/verifier/verify.ts` re-checks a finished run from session exports:
  fresh dispatches, target reads, read-only tool use, and absence of
  parent-only markers in reviewer context.

## Verification status

Verified on OpenCode 2.2.6 with `opencode-go/crouton-alpha-free`
(2026-11-09). See the verification record for the full evidence:

- Preflight permission check: every expectation passes against the
  effective configuration reported by OpenCode (see the check output in
  the verification record).
- Native probe (planted parent/instruction/.env markers, negative write and
  secret-read attempts): PASS.
- Live end-to-end `/egm-brainstorm` → `/egm-draft` → `/egm-review`: see the
  verification record.

## Limitations

- Experimental. EGM upstream supports OpenCode **v1** only; this adapter is
  an independent v2 port and is not an upstream Google project.
- Review targets must live inside the project directory you launch in;
  reviewers may read the bundle and the project, not arbitrary external
  paths.
- `/egm-bootstrap`'s orchestrator/synthesizer personas are not delegated to
  in v0.1; treat bootstrap output as unverified by fresh-context review.
- The permission guarantee covers launches through `egm-opencode.sh`
  (preflight-verified). Launching OpenCode with the generated config by
  hand is outside the guarantee.
- Reviewers are denied reading files named `AGENTS.md` or `CLAUDE.md`
  anywhere (a Phase 3 run showed a persona reading `AGENTS.md` as a
  document while exploring a project). Reviewing a document that is
  itself named `AGENTS.md`/`CLAUDE.md` is therefore out of scope for
  reviewers in v0.1. Host-side ambient injection of instruction files
  into subagent context was not observed; the verified guarantee is
  parent-conversation isolation plus this filename guard.

## Development

```sh
bun install
bun run lint        # oxlint
bun run format      # oxfmt (docs/ and vendor/ are excluded)
bun test            # unit tests
bun run tests/probe/run.ts   # native probe (needs a working opencode + model)
bun run tests/e2e/run.ts     # live end-to-end (slow; uses your model quota)
```

## License

Apache-2.0. The vendored EGM snapshot keeps its upstream license and
attribution (`vendor/egm/LICENSE`); snapshot provenance is recorded in
`vendor/egm/SOURCE.json`.
