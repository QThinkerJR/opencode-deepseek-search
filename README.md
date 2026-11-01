# DeepSeek Search for OpenCode V2

DeepSeek Search & Fetch as an OpenCode V2 plugin: **the built-in `websearch` tool routes to DeepSeek**, a clean
Markdown fetch tool, and local usage/cost stats. Flip one option to go back to native search.

Differs from the existing same-named V1 package: this one targets the **V2 plugin API**, is **switchable**
(`mode: "deepseek" | "native"`), and reports **local usage and estimated cost**.

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
```

Then add the plugin to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "@qthinker/opencode-deepseek-search"
  ]
}
```

With options (recommended — this is where `mode` lives):

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
    { "package": "D:/MyDev/opencode-deepseek-search", "options": { "mode": "deepseek" } }
  ]
}
```

`opencode plugin list` should show `deepseek-search`. Config changes take effect immediately: the plugin is
re-run in place, no `/reload` or service restart needed.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `mode` | `"deepseek" \| "native"` | `deepseek` | Which backend serves the `websearch` tool |
| `apiKey` | string | `DEEPSEEK_API_KEY` | Usually `"{env:DEEPSEEK_API_KEY}"`; unset env becomes `""` |
| `count` | 1–50 | `5` | Results per search (does not change the price) |
| `fetchMaxChars` | 500–200000 | `30000` | Truncation limit for `deepseek_fetch`, with an explicit notice |
| `pricePerThousand` | 0–10000 | `5` | CNY per 1000 requests (integer), used only for the local cost estimate |

## What you get

**`websearch` (unchanged name, unchanged input).** In `deepseek` mode the built-in tool is rerouted to DeepSeek, so
the model needs no prompt changes and sees the same tool. The patch keeps the built-in permission check and the
declared output shape, so approval prompts and rendering are unchanged. Results carry `summary` (600–800 chars,
written for models) or `snippet` — never the full page text, and `need_content` is never requested.

> Why the tool is rerouted instead of relying on a provider default: in 2.2.5, a plugin's
> `websearch.default.set()` is overwritten by the built-in config plugin registered later, so the tool keeps using
> the built-in provider. The plugin therefore patches the built-in tool itself; the built-in permission check is kept,
> while the "choose a search provider" form never appears in deepseek mode. If the built-in tool cannot be
> found (other versions), the provider registration remains and you can force routing with
> `"websearch": { "provider": "deepseek" }` in the config file.

**`deepseek_fetch`** — one URL in, clean Markdown out, plus a title/source header. Long pages are cut at
`fetchMaxChars` and end with `[DeepSeek Fetch 截断提示]`. The built-in `webfetch` is never overridden.

**`deepseek_usage`** — ask the model *"how many searches did I make and what did they cost?"*.

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

Queries and URLs are sent to `https://api.deepseek.com`. Nothing else leaves your machine; the usage ledger stays
in local OpenCode storage. The API key is never logged.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `未配置 DeepSeek API Key` (missing key) | Set `DEEPSEEK_API_KEY`, restart the OpenCode service once so the new process inherits it |
| `401` invalid key | Check the key and that `apiKey`/env points at it |
| `402` insufficient balance | Top up; failed requests are not billed |
| `429` rate limited | Backed off once already; retry later |
| `403` / `404` on fetch | The site blocks extraction or the page has no readable text; try the built-in `webfetch` |
| Backend still looks native | `mode` is `native`, or the built-in `websearch` tool was not found; set `"websearch": { "provider": "deepseek" }` |

## License

MIT. Not affiliated with DeepSeek.
