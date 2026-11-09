# opencode-plugin-egm

An OpenCode v2 plugin that runs
[EGM (Elephant Goldfish Model)](https://github.com/google/elephant-goldfish-model)
on OpenCode: a context-holding Elephant drafts design documents, and
fresh-context Goldfish subagents review them. The human keeps every
approval gate.

## Install

Add the plugin to your OpenCode config (`opencode.json` or
`opencode.jsonc`). That is the only setup step.

```json
{ "plugins": ["opencode-plugin-egm"] }
```

OpenCode installs the package from npm and loads it. On load, the
plugin registers:

- the `egm` primary agent (set as the default agent), which may write,
  edit, and run shell commands as the orchestrating Elephant;
- eight read-only reviewer subagents: `egm-codebase-details`,
  `egm-comprehension`, `egm-design`, `egm-implementation-readiness`,
  `egm-inventive-catalyst`, `egm-structural`, `egm-style`,
  `egm-zoom-out`;
- the seven canonical EGM skills and the matching slash commands
  (`/egm-brainstorm`, `/egm-draft`, `/egm-review`, `/egm-review-loop`,
  `/egm-resolve`, `/egm-bootstrap`, `/egm-drift-report`).

The canonical EGM bundle ships inside the package as a git submodule
of the upstream repository, pinned to the EGM v0.1.1 commit
(`e9e1f06aa4e26e95cd4ed37210a0632202c429e9`), and is used unmodified.

The plugin does not fix a model. Review quality depends on the model
you configure in OpenCode.

## Isolation properties

Verified on OpenCode v2.2.6 (see
`docs/verification/verification-2026-11-09.md`):

- Reviews run in fresh subagent sessions: the parent's conversation
  history is not part of a reviewer's context (parent-conversation
  isolation).
- Reviewers are read-only. Their permissions deny writes, shell, and
  delegation, deny reading `.env` files, and deny reading the project
  instruction files `AGENTS.md` and `CLAUDE.md`.
- The primary may dispatch only to the eight registered reviewers.

## Limitations

- Review targets must be files inside the project directory, because
  reviewers cannot read outside it. A file named `AGENTS.md` or
  `CLAUDE.md` cannot be a review target.
- Reviewers read project documents; that is their job. Content inside
  ordinary project documents can still reach a reviewer indirectly.
- The `bootstrap_orchestrator` and `synthesizer` personas are not
  delegated in v0.1; `egm-bootstrap` and `egm-drift-report` run in the
  primary session.
- Slash-command arguments reach the plugin as text. The plugin passes
  them to the model as data, never to a shell, and instructs the model
  to refuse inputs containing shell expansion markers such as `$(...)`;
  because expansion happens on the host, pass document paths, not
  shell fragments.

## Development

```sh
git clone --recursive https://github.com/pycabbage/opencode-plugin-egm
cd opencode-plugin-egm
bun install
bun test          # unit tests for the plugin's registrations
bun run probe     # live marker probe against a real OpenCode
bun run e2e       # live brainstorm -> draft -> review run
```

To try a local checkout before publishing, point `plugins` at the
checkout directory instead of the package name.

## License

Apache-2.0. The bundled EGM content is Apache-2.0, Copyright Google
LLC; see `vendor/egm/LICENSE`.
