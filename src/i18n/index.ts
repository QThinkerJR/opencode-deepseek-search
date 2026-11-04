// The plugin's only copy source and the language resolver.
//
// The server resolves one `Language` at setup, puts it in the RPC `status`
// payload, and the tools and both sidebars render with it — so the chat output
// and the two sidebars can never disagree. Pure data and pure functions: no
// plugin or host imports, so every runtime can load this module.

import { isLanguage, type Language } from "../rpc.ts"
import { en, enBalanceForms, enHintForms, enUsageForms, type Key, type Messages } from "./en.ts"
import { ja, jaBalanceForms, jaHintForms, jaUsageForms } from "./ja.ts"
import { zh, zhBalanceForms, zhHintForms, zhUsageForms } from "./zh.ts"

export type { Key, Messages }

/** One language's complete copy: strings plus the ladders that take widths. */
export interface LocalePack {
  readonly messages: Messages
  /** Usage-row ladder, richest first; see `en.ts`. */
  readonly usageForms: readonly string[]
  /** Missing-key hint ladder, richest first. */
  readonly hintForms: readonly string[]
  /** Balance-row ladder, verbose first; `{amount}` carries the currency symbol. */
  readonly balanceForms: readonly string[]
}

const PACKS: Readonly<Record<Language, LocalePack>> = {
  en: { messages: en, usageForms: enUsageForms, hintForms: enHintForms, balanceForms: enBalanceForms },
  ja: { messages: ja, usageForms: jaUsageForms, hintForms: jaHintForms, balanceForms: jaBalanceForms },
  "zh-CN": { messages: zh, usageForms: zhUsageForms, hintForms: zhHintForms, balanceForms: zhBalanceForms },
}

export function pack(language: Language): LocalePack {
  return PACKS[language]
}

export function messages(language: Language): Messages {
  return PACKS[language].messages
}

export type Params = Readonly<Record<string, string | number>>

/**
 * Fill `{name}` placeholders. A brace group that is not a supplied parameter is
 * left verbatim, which keeps literals such as `{env:DEEPSEEK_API_KEY}` intact.
 */
export function format(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** One message. An unknown key falls back to the key itself, never to a crash. */
export function t(language: Language, key: Key, params?: Params): string {
  const table: Readonly<Record<string, string>> = messages(language)
  const template = table[key]
  return template === undefined ? key : format(template, params)
}

// ---------- language resolution ----------

/** The only environment the resolver looks at; both are POSIX locale names. */
export interface LanguageEnv {
  readonly LC_ALL?: string
  readonly LANG?: string
}

export interface LanguagePick {
  readonly language: Language
  /** The raw option value when it was not a known language; the caller warns. */
  readonly problem?: string
}

/**
 * `options.language` wins; otherwise `LC_ALL` (which overrides `LANG` per
 * POSIX), then `LANG`, then English. Prefix matching keeps `ja_JP.UTF-8` and
 * `zh_CN.UTF-8` working without an alias table; anything else is English.
 */
export function resolveLanguage(option: unknown, env: LanguageEnv = {}): LanguagePick {
  if (option !== undefined && option !== null && option !== "") {
    if (isLanguage(option)) return { language: option }
    return { language: fromEnv(env), problem: String(option) }
  }
  return { language: fromEnv(env) }
}

function fromEnv(env: LanguageEnv): Language {
  const raw = (env.LC_ALL?.trim() || env.LANG?.trim() || "").toLowerCase()
  if (raw.startsWith("ja")) return "ja"
  if (raw.startsWith("zh")) return "zh-CN"
  return "en"
}
