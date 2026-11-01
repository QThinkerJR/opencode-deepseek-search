# DeepSeek Search for OpenCode V2

[![npm version](https://img.shields.io/npm/v/@qthinker/opencode-deepseek-search)](https://www.npmjs.com/package/@qthinker/opencode-deepseek-search)
[![license](https://img.shields.io/npm/l/@qthinker/opencode-deepseek-search)](./LICENSE)
[![node](https://img.shields.io/node/v/@qthinker/opencode-deepseek-search)](https://nodejs.org)
[![opencode](https://img.shields.io/badge/opencode-%E2%89%A52.2.5-black)](https://opencode.ai)

DeepSeek Search & Fetch as an OpenCode V2 plugin: **the built-in `websearch` tool routes to DeepSeek**, plus a clean
Markdown fetch tool, local usage/cost stats, and a **persisted** backend switch.

Three ways back to native search: change the `mode` option, ask the model to call `deepseek_mode`, or run
`tools/switch-mode.ps1` from the repo.
中文说明见 [docs/README.zh-CN.md](https://github.com/QThinkerJR/opencode-deepseek-search/blob/main/docs/README.zh-CN.md)。

Differs from the existing same-named V1 package: this one targets the **V2 plugin API**, switches backends **at
runtime**, and reports **local usage and estimated cost**.

> Verified against `opencode 2.2.5` with `@opencode/plugin@2.2.5` on Windows. Search/Fetch API facts come from
> <https://api-docs.deepseek.com/zh-cn/guides/search>.

## Requirements

- `opencode >= 2.2.5` (V2 plugin API)
- Node.js `>= 22.18` (the plugin ships TypeScript sources)
- A DeepSeek API key with Search/Fetch access

## Install

Set the key once (Windows, user scope):

```powershell
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "sk-...", "User")
opencode service restart   # User-scope variables only reach new processes
```

Then add the plugin to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@qthinker/opencode-deepseek-search"]
}
```

With options (recommended — this is where `mode` and friends live):

```jsonc
{
  "plugins": [
    {
      "package": "@qthinker/opencode-deepseek-search",
      "options": {
        "mode": "deepseek",
        "count": 5,
        "apiKey": "{env:DEEPSEEK_API_KEY}"
      }
    }
  ]
}
```

Local development points at the repository directory (a config entry must be a **directory**, not a file):

```jsonc
{
  "plugins": [
    { "package": "D:/repos/opencode-deepseek-search", "options": { "mode": "deepseek" } }
  ]
}
```

`opencode plugin list` should show `deepseek-search`. Config changes take effect immediately: the plugin is
re-run in place, no `/reload` or service restart needed.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `mode` | `"deepseek" \| "native"` | `deepseek` | Default backend for `websearch`; a persisted `deepseek_mode` switch overrides it |
| `apiKey` | string | `DEEPSEEK_API_KEY` | Usually `"{env:DEEPSEEK_API_KEY}"`; unset env becomes `""` |
| `count` | 1–50 | `5` | Results per search (does not change the price) |
| `fetchMaxChars` | 500–200000 | `30000` | Truncation limit for `deepseek_fetch`, with an explicit notice |
| `pricePerThousand` | 0–10000 | `5` | CNY per 1000 requests (integer), used only for the local cost estimate |

## Tools

| Tool | What it does |
|---|---|
| `websearch` (built-in) | Same name and input; in `deepseek` mode this plugin supplies the results |
| `deepseek_fetch` | One URL in, clean Markdown out, cut at `fetchMaxChars` with a notice |
| `deepseek_usage` | Local search/fetch counts and estimated cost; `reset: true` clears it |
| `deepseek_mode` | Report or switch the search backend; the switch is persisted |

The reroute **keeps the built-in permission check and the declared `output` shape**, so approval prompts and rendering
are unchanged. Results carry `summary` (600–800 chars, written for models) or `snippet` — never the full page text,
and `need_content` is never requested.

## Switching backends

### Three ways

| Way | How | Persisted | Use it for |
|---|---|---|---|
| Config | Edit `options.mode`; applies on save | Yes (in the config file) | The long-term default |
| Tool | Ask the model to call `deepseek_mode`, or call it yourself | Yes (plugin storage `mode/v1`) | Switching mid-session without touching files |
| Script | `.\tools\switch-mode.ps1 native` | Yes (the script edits the config) | Quick switch from a terminal, no editor |

`deepseek_mode` actions:

| Call | Effect |
|---|---|
| `deepseek_mode` (or `{"mode": "status"}`) | Report the current backend **and where it comes from** (config file / persisted switch) |
| `deepseek_mode({"mode": "deepseek"})` | Route the built-in `websearch` tool to DeepSeek |
| `deepseek_mode({"mode": "native"})` | Leave the built-in backend alone again |
| `deepseek_mode({"mode": "config"})` | Clear the persisted switch so `options.mode` decides again |

### Precedence

```
deepseek_mode switch (storage: mode/v1)  >  options.mode  >  built-in default
```

- The switch lives in OpenCode's local plugin storage (`mode/v1`) — **global to the installation and persisted across
  restarts** — and it never modifies your config file.
- Because it wins over the config file, an edit that "does nothing" means a stored switch is present: ask
  `deepseek_mode` (it names the source), then clear it with `mode: "config"`.
- The provider is registered in both modes, so the worst case at any step is "keep the previous backend" — never
  "no search available".

### What native mode still gives you

`websearch` is left completely alone and serves your existing backend. `deepseek_fetch`, `deepseek_usage` and
`deepseek_mode` remain registered (they are additive), and the provider is still registered, so you can select it
explicitly with `providerID: "deepseek"` or config `"websearch": { "provider": "deepseek" }`.

> Why the tool is rerouted instead of relying on a provider default: in 2.2.5, a plugin's `websearch.default.set()` is
> overwritten by the built-in config plugin registered later, so the tool keeps using the built-in provider. The plugin
> therefore patches the built-in tool itself; the built-in permission check is kept, while the "choose a search
> provider" form never appears in deepseek mode. If a version does not expose that tool, `deepseek_mode` says it cannot
> switch at runtime — use `websearch.provider` in the config instead.

## Usage and cost

| Counter | Counted when | Billed |
|---|---|---|
| `search` | HTTP 200 and `results` non-empty | ¥0.005 per request |
| `fetch` | HTTP 200 and body non-empty | ¥0.005 per request |
| `empty` | HTTP 200 with empty results/body | not billed |
| `failed` | network error, or non-200 after one retry | not billed |

Costs accumulate in integer micro-CNY, so repeated additions never drift. `count` does not affect the price.
`deepseek_usage({ "reset": true })` clears the ledger after reporting.

- Stored under `ctx.storage` key `usage/v1`, last 60 days kept, day keys in local time.
- Storage is global to the OpenCode installation and survives restarts.
- **Local stats ≠ your DeepSeek bill**: only this machine, this plugin. Other tools and machines are not counted,
  and concurrent OpenCode servers can lose a count (last write wins).

## Rate limits and cost

Search 100 QPS / Fetch 25 QPS per account (Fetch is also limited per target domain). A single request costs
¥0.005. A single retry backs off on 408/429/5xx only, honors `Retry-After` (capped at 5s), and is cancellable.

## Privacy

Queries and URLs are sent to `https://api.deepseek.com`. Nothing else leaves your machine; the usage ledger and the
mode switch stay in local OpenCode storage. The API key is never logged.

Search results and fetched pages are **third-party text**: treat them as data, never as instructions — a page can
contain text that tries to steer the model.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Unsure which backend search uses | Call `deepseek_mode` — it reports the backend **and** its source |
| Config edit seems ignored | A persisted switch is present (the source says so); clear it with `deepseek_mode({"mode": "config"})` |
| `未配置 DeepSeek API Key` (missing key) | Set `DEEPSEEK_API_KEY`, restart the OpenCode service once so the new process inherits it |
| `401` invalid key | Check the key and that `apiKey`/env points at it |
| `402` insufficient balance | Top up; failed requests are not billed |
| `429` rate limited | Backed off once already; retry later |
| `403` / `404` on fetch | The site blocks extraction or the page has no readable text; try the built-in `webfetch` |
| Search still hits the native backend | `mode` or the persisted switch is `native`; if both are `deepseek`, the built-in `websearch` tool was not found — use config `"websearch": { "provider": "deepseek" }` |

## Local development

```powershell
cd D:\repos\opencode-deepseek-search
npm install
npm run typecheck     # tsc --noEmit
npm test              # node --test, pure functions, zero cost
npm run smoke         # real API smoke; skipped without DEEPSEEK_API_KEY
npm pack --dry-run    # audit the publish artifacts
```

One-command switch (repo-only helper; edits `options.mode` in `opencode.jsonc`, backing it up to `opencode.jsonc.bak-switch`):

```powershell
.\tools\switch-mode.ps1 status
.\tools\switch-mode.ps1 native
.\tools\switch-mode.ps1 deepseek
```

If ExecutionPolicy blocks it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\switch-mode.ps1 native
```

Shorter, via an alias in `$PROFILE`:

```powershell
function dsmode { & "D:\repos\opencode-deepseek-search\tools\switch-mode.ps1" @args }
```

Layout:

```
index.ts              # directory-plugin entry, re-exports src/index.ts
src/index.ts          # plugin: options, registration, websearch patch, three tools
src/deepseek.ts       # HTTP core: timeout/cancel, single backoff retry, Chinese errors, mapping
src/usage.ts          # pure ledger: micro-CNY pricing, 60-day prune, defensive parse, formatting
test/*.test.ts        # pure-function tests
scripts/smoke.ts      # real-API smoke (5 steps)
tools/switch-mode.ps1 # terminal backend switch
.github/workflows/    # ci (typecheck + test) / release (tag-triggered, OIDC provenance)
```

Two packaging traps (already avoided — do not reintroduce them):

1. A configured local plugin path must be a **directory**; a single file is dropped.
2. Do **not** add `exports` to `package.json`: with `name` + `exports`, OpenCode resolves the directory by package
   name, and when the resolved entrypoint falls outside the directory it is **silently dropped** (no log line,
   it just disappears from `plugin list`).

Source edits hot-reload on save; verify with `opencode plugin list` plus one real search.

## License

MIT. Not affiliated with DeepSeek.
