# Changelog

All notable changes to this package. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the version numbers follow [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-02

### Added

- **TUI sidebar card** (`sidebar.content`): takeover state, today / month / lifetime usage, and a one-click
  enable/disable at the right edge of the title. Everything degrades with the sidebar's *measured* width — full
  `Search` / `Fetch` words when they fit, abbreviations only when they do not, never a wrapped row. `/deepseek`
  opens the same actions as a menu, and the card also appears when the takeover is disabled.
- **Desktop side panel**: a DeepSeek tab in a session's side region, listed in the side region's *New tab* page and
  its `+` menu, plus the `DeepSeek: 打开统计面板` command. Ships as the prebuilt CommonJS `gui-experimental.cjs`
  bundle the desktop app requires.
- **RPC contract between the halves** (`status`, `setMode`, a `changed` event), so both sidebars read the same ledger
  and the same stored switch as the tools. There is no second source of truth.
- **`counts` in the `status` payload** (optional): structured today / month / lifetime counters, so each surface can
  lay the numbers out for its own width. Older clients keep working off the pre-formatted strings.
- **Packaging regression test**: `package.json` must stay free of `exports`, and the root entries (`index.ts`,
  `tui.ts`, `gui-experimental.cjs`) must keep resolving for both directory and installed-package resolution.

### Changed

- `peerDependencies["@opencode/plugin"]` is now `>=2.2.5`; `@opentui/core`, `@opentui/solid`, `solid-js` and
  `@opencode/theme` are declared as optional peers, because the host provides them.
- `npm run typecheck` covers the GUI project as well; `prepublishOnly` builds the GUI bundle; CI builds and checks
  the bundle before running the tests, and the release workflow does the same before publishing.
- Docs: which file enables which half (`opencode.json(c)` for server + desktop, `cli.json` for the TUI), the reload
  rules for each half, and troubleshooting entries for the three “nothing shows up” cases.

### Fixed

- The TUI card no longer wraps its usage rows in a narrow sidebar, and its action row can no longer be clipped.
- `status` RPC calls must send an empty object; an omitted input was rejected as `rpc.invalid_input` (400).
- The desktop panel now registers a `session.panel` menu item, so it appears in the side region's launcher instead of
  being reachable only from the command palette.
- Removed the UTF-8 BOM from `package.json`, which made Vite's JSON parse fail while building the GUI bundle.

## [0.1.1] - 2026-11-01

### Changed

- npm landing page uses the English README, plus badges; repository URLs aligned with the public repo.

## [0.1.0] - 2026-11-01

### Added

- First release: the built-in `websearch` tool routed to DeepSeek Search, `deepseek_fetch` (clean Markdown),
  `deepseek_usage` (local counts and estimated cost), `deepseek_mode` (persisted backend switch), and the
  `tools/switch-mode.ps1` helper.
