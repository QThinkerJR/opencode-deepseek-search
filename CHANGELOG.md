# Changelog

All notable changes to this package. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the version numbers follow [Semantic Versioning](https://semver.org/).

## [0.3.2] - 2026-11-04

### Added

- **Account balance in both sidebars**: the server probes `GET /user/balance`
  (<https://api-docs.deepseek.com/zh-cn/api/get-user-balance>) with the same API key and serves a
  cached snapshot through the `status` RPC as an optional `balance` field — 60s TTL, at most one upstream request
  per minute, failures keep the last snapshot, and the balance is absent until the first successful probe. The TUI
  card closes its body with the balance (warning-colored when the account cannot pay, dropped below ~12 columns
  instead of squeezed, shown only in the two states that point at the account); the desktop panel shows an account
  block below the usage table with the granted/topped-up split on hover (shown only when both components are
  non-zero). Manual refresh (the desktop refresh
  button, the TUI dialog's *Refresh*, both retry paths) forces a re-probe; the 10-second polls never do.
- **Sidebar display overhaul**: the usage ladders now put money before words (the cost survives to much narrower
  widths in every language, and the old words-only rungs that outranked a cheaper money row are gone), below the
  numeric floor the three usage rows collapse into one digit-carrying row instead of bare labels, the TUI body
  gained three text tiers plus a 2-column indent on wider sidebars, the state word goes bold when the glyph is
  dropped, and the desktop panel tightens its table typography (10px chunk gaps, trailing separators removed,
  letter-spacing on Latin labels only, a 12px glyph cell, money chunks that never wrap away from their digits).

### Removed

- `tools/switch-mode.ps1`, the terminal helper that rewrote `options.mode` in `opencode.jsonc`. The switch has lived in
  plugin storage (`mode/v1`) since the first release and `deepseek_mode` covers the terminal case, so the script only
  duplicated it — and on Windows PowerShell 5.1 its `Set-Content -Encoding UTF8` wrote a BOM, after which
  `opencode plugin add/update/remove` rejected the whole config as invalid.

## [0.3.0] - 2026-11-02

### Added

- **UI languages `en` / `ja` / `zh-CN`**: the server resolves the language once (`options.language` > `LC_ALL`/`LANG` >
  English) and carries it to both sidebars over RPC, so tool output, the TUI card, the desktop panel, commands, menus
  and dialogs always speak the same language. Every language owns its narrow-width ladder; the Japanese copy is new and
  the Chinese copy keeps the previous wording.
- `options.language` (`"en" | "ja" | "zh-CN"`, unset = auto). An unknown value logs a warning and falls back to
  auto-detection instead of blocking the plugin.

### Changed

- **The default UI language is now English.** To keep the previous Chinese interface, set `"language": "zh-CN"` in the
  plugin options; the sidebars pick it up on their next status read (a restart always works).
- Console diagnostics are English in every language, and the `deepseek_fetch` Markdown header follows the UI language
  instead of a hardcoded Chinese `来源:`.

## [0.2.1] - 2026-11-02

### Changed

- Release plumbing only: this version exists to validate the package's npm **Trusted Publishing** connection, so
  tag-triggered releases publish with provenance and no long-lived token. No functional change since 0.2.0.

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
