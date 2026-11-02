// English copy: the source language and the fallback for every key.
//
// Every other locale is typed against `Key` (the keys of this table), so a
// missing translation is a compile error rather than a silent English string.
// Templates interpolate `{name}` through `format()` in ./index.ts; a brace group
// that is not a known parameter (e.g. `{env:DEEPSEEK_API_KEY}`) is left alone.

export const en = {
  // ---------- sidebar states: full wording, then the short form used when the
  // row cannot hold the full one ----------
  "state.loading": "Loading…",
  "state.loadingShort": "Loading…",
  "state.failed": "Read failed",
  "state.failedShort": "Failed",
  "state.enabled": "Enabled",
  "state.enabledShort": "On",
  "state.disabled": "Disabled",
  "state.disabledShort": "Off",
  "state.unpatched": "websearch not taken over",
  "state.unpatchedShort": "Not taken over",
  "state.missingKey": "API key missing",
  "state.missingKeyShort": "No API key",

  // ---------- the clickable action on the card ----------
  "action.disable": "Disable",
  "action.enable": "Enable",
  "action.release": "Release",
  "action.retry": "Retry",

  // ---------- desktop panel ----------
  "panel.tooltip.refresh": "Refresh usage",
  "panel.loading": "Reading usage…",
  "panel.label.on": "Disable (release to native search)",
  "panel.label.off": "Enable (take over with DeepSeek)",
  "panel.label.warn": "Release to native search",
  "panel.label.error": "Retry",
  "panel.label.idle": "Retry",

  // ---------- host chrome: commands, menus, toasts, dialogs ----------
  "command.open": "DeepSeek: Open usage panel",
  "command.toggle": "DeepSeek: Enable/disable search takeover",
  "menu.description": "Search usage and the takeover switch",
  "toast.openSessionFirst": "Open a session first",
  "toast.statusMalformed": "Status payload has the wrong shape",
  "toast.modeMalformed": "Mode switch result has the wrong shape",
  "dialog.title": "DeepSeek search",
  "dialog.enable": "Enable",
  "dialog.enableDesc": "Take over the built-in websearch",
  "dialog.disable": "Disable",
  "dialog.disableDesc": "Return the built-in websearch to the host",
  "dialog.refresh": "Refresh",
  "dialog.refreshDesc": "Re-read status and usage",

  // ---------- deepseek_mode output ----------
  "mode.report": "Current search backend: {mode} (source: {source}){suffix}",
  "mode.source.override": "deepseek_mode switch, persisted",
  "mode.source.config": "config file options.mode",
  "mode.suffix.patched": " · built-in websearch is served by DeepSeek",
  "mode.suffix.notPatched": " · built-in websearch was not found, so nothing is taken over",
  "mode.suffix.native": " · built-in websearch stays native",
  "mode.notFound":
    "Built-in {tool} tool not found; it cannot be switched at runtime. " +
    'Set options.mode to "{mode}" in the config file instead.',
  "mode.configCleared": "Persisted switch cleared; back to the config file ({mode}).",
  "mode.persisted":
    "Persisted: still {mode} after restarting OpenCode. " +
    'To return to the config file, call deepseek_mode with mode: "config".',
  "mode.statusOnly": "status only reports the current mode; it does not switch.",
  "mode.invalid": "mode must be status / deepseek / native / config, got: {raw}",

  // ---------- tool progress / bookkeeping ----------
  "progress.fetch": "DeepSeek Fetch: fetching {url}",
  "fetch.source": "Source: {url}",
  "usage.reset": "Local stats cleared.",

  // ---------- deepseek_usage report ----------
  "usage.report.title":
    "DeepSeek usage (local counts, estimated per successful request; current mode {mode}; ¥{price}/1000 requests)",
  "usage.report.line":
    "{label}: searches {search} · fetches {fetch} · empty/failed {skipped} (empty {empty} / failed {failed}) · est. {cost}",
  "usage.report.note":
    "Note: empty and failed requests are not billed; DeepSeek's account-side bill is authoritative, and these counts exclude other machines or tools.",
  "usage.label.today": "Today",
  "usage.label.month": "Month",
  "usage.label.total": "Total",
  "usage.summary.line": "Search {search} · Fetch {fetch} · empty/failed {skipped} · {cost}",

  // ---------- errors ----------
  "error.missingKey":
    "DeepSeek API key is not configured. Set the DEEPSEEK_API_KEY environment variable " +
    '(PowerShell: [Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY","sk-...","User")), ' +
    'or write "apiKey": "{env:DEEPSEEK_API_KEY}" in the plugin options, then restart opencode.',
  "error.http.400":
    "Invalid DeepSeek request parameters (400){upstream}. Queries must be 1–128 characters; " +
    "Fetch URLs must be valid absolute http(s) URLs.",
  "error.http.401":
    "Invalid DeepSeek API key (401){upstream}. Check the DEEPSEEK_API_KEY environment variable or options.apiKey.",
  "error.http.402": "Insufficient DeepSeek account balance (402); failed requests are not billed. Top up and try again.",
  "error.http.403": "DeepSeek Fetch was blocked by the target site's security policy (403){upstream}.{hint}",
  "error.http.404": "DeepSeek could not extract the page body (404){upstream}. Check that the link is reachable.{hint}",
  "error.http.408": "DeepSeek request timed out (408); one backoff retry also failed. Try again later.",
  "error.http.413": "DeepSeek request body too large (413). Shorten the input.",
  "error.http.429":
    "DeepSeek rate limit hit (429; account limits: Search 100 QPS / Fetch 25 QPS); " +
    "one backoff retry also failed. Try again later.",
  "error.http.5xx":
    "DeepSeek server error ({status}); one backoff retry also failed. " +
    'You can set options.mode to "native" to use native search for now.',
  "error.http.other": "DeepSeek request failed (HTTP {status}){upstream}",
  "error.http.fetchHint": " You can use the built-in webfetch tool for this page.",
  "error.parse": "DeepSeek returned an unparseable response (HTTP {status}). Try again later.",
  "error.aborted": "DeepSeek request cancelled.",
  "error.timeout": "DeepSeek request timed out ({seconds}s). Try again.",
  "error.network": "Cannot reach {base} (network error: {message}). Check your network or proxy settings.",
  "error.validate.queryEmpty": "Empty query: DeepSeek Search needs a non-empty query (1–128 characters).",
  "error.validate.queryLong": "Query too long ({length} characters, limit {max}); shorten it and retry.",
  "error.validate.urlScheme": 'Invalid URL: "{url}". DeepSeek Fetch only supports absolute http/https URLs.',
  "error.validate.urlLong": "URL too long ({length} > {max} characters).",
  "error.validate.urlHost": 'URL has no host: "{url}".',
  "error.validate.urlUserinfo": "URL must not contain a username/password (userinfo).",
  "error.validate.urlParse": 'Cannot parse URL: "{url}".',
  "error.fetch.truncated":
    "[DeepSeek Fetch truncated] The page is {raw} characters; the limit is {max}, so only the first {max} characters are kept.",
} as const

export type Key = keyof typeof en
/** One locale's complete table: every key, no extras. */
export type Messages = Record<Key, string>

/**
 * Usage-row ladder, richest first. Each entry is a complete row, so nothing is
 * ever left dangling and no number is ever cut from its unit. `{label}` is the
 * localized period label; `Search`/`Fetch` stay English in every language.
 */
export const enUsageForms: readonly string[] = [
  "{label}  Search {search}  Fetch {fetch}  {cost}",
  "{label} Search {search} Fetch {fetch} {cost}",
  "{label}  Search {search}  Fetch {fetch}",
  "{label} Search {search} Fetch {fetch}",
  "{label}  {search}S  {fetch}F  {cost}",
  "{label}  {search}S  {fetch}F",
  "{label}  {search}S",
]

/** Missing-key hint ladder, richest first. The env var name is always present. */
export const enHintForms: readonly string[] = [
  "Set DEEPSEEK_API_KEY and restart",
  "Set DEEPSEEK_API_KEY",
  "Set API KEY",
  "Set KEY",
]
