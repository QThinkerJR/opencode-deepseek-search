import assert from "node:assert/strict"
import { test } from "node:test"
import { LANGUAGE_VALUES, isLanguage } from "../src/rpc.ts"
import { en, type Messages } from "../src/i18n/en.ts"
import { ja } from "../src/i18n/ja.ts"
import { zh } from "../src/i18n/zh.ts"
import { format, messages, pack, resolveLanguage, t } from "../src/i18n/index.ts"

// The copy is a table, so the checks are structural: every locale has exactly
// the English keys, every template's placeholders match, and each ladder is
// usable at any width. Wording itself is reviewed by the user, not asserted here.

const LOCALES = ["en", "ja", "zh-CN"] as const
const TABLES: Readonly<Record<(typeof LOCALES)[number], Messages>> = { en, ja, "zh-CN": zh }

/** `{name}` groups only: `{env:...}` literals are not parameters. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

test("every locale defines exactly the English keys", () => {
  const english = Object.keys(en).sort()
  for (const language of LOCALES) {
    assert.deepEqual(Object.keys(TABLES[language]).sort(), english, `${language} key set differs`)
  }
})

test("every message has the same placeholders in every locale", () => {
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    const expected = placeholders(en[key])
    for (const language of LOCALES) {
      assert.deepEqual(placeholders(TABLES[language][key]), expected, `${language} ${key}`)
    }
    // The parameter names themselves must exist on the English side too.
    for (const name of expected) assert.match(en[key], new RegExp(`\\{${name}\\}`))
  }
})

test("each locale's usage ladder is a descending set of complete rows", () => {
  const allowed = new Set(["label", "search", "fetch", "cost"])
  for (const language of LOCALES) {
    const forms = pack(language).usageForms
    assert.ok(forms.length >= 5, `${language} has too few usage forms`)
    for (const form of forms) {
      // Every row carries the period label and the search count, and only known
      // placeholders may appear: an unknown one would render verbatim.
      assert.match(form, /\{label\}/, `${language}: ${form}`)
      assert.match(form, /\{search\}/, `${language}: ${form}`)
      for (const name of placeholders(form)) {
        assert.ok(allowed.has(name), `${language}: unexpected placeholder {${name}} in ${form}`)
      }
    }
    // The ladder descends: the richest row has the amount, the last one does not.
    assert.match(forms[0] ?? "", /\{cost\}/, `${language}: the richest row must carry the amount`)
    assert.doesNotMatch(forms[forms.length - 1] ?? "", /\{cost\}/, `${language}: the last row must drop the amount`)
  }
})

test("each locale's hint ladder always names the environment variable", () => {
  for (const language of LOCALES) {
    const hints = pack(language).hintForms
    assert.ok(hints.length >= 3)
    assert.ok(
      hints.every((hint) => hint.includes("DEEPSEEK_API_KEY") || hint.includes("KEY")),
      `${language}: a hint lost the variable name`,
    )
    assert.ok(hints[0]?.includes("DEEPSEEK_API_KEY"), `${language}: the full hint must name the variable`)
  }
})

test("format fills params and leaves unknown braces alone", () => {
  assert.equal(format("{label}: {count}", { label: "Today", count: 3 }), "Today: 3")
  assert.equal(format("{env:DEEPSEEK_API_KEY}"), "{env:DEEPSEEK_API_KEY}")
  assert.equal(format("{missing}", { count: 1 }), "{missing}")
  assert.equal(format("plain"), "plain")
})

test("t reads the requested locale and falls back to the key", () => {
  assert.equal(t("en", "action.enable"), "Enable")
  assert.equal(t("ja", "action.enable"), "有効化")
  assert.equal(t("zh-CN", "action.enable"), "启用")
  assert.equal(t("en", "mode.report", { mode: "deepseek", source: "config", suffix: "" }), "Current search backend: deepseek (source: config)")
  assert.equal(t("en", "no.such.key" as never), "no.such.key")
})

test("messages() returns the same table for every locale", () => {
  for (const language of LOCALES) assert.equal(messages(language), TABLES[language])
})

test("resolveLanguage: explicit option wins", () => {
  for (const language of LANGUAGE_VALUES) {
    assert.deepEqual(resolveLanguage(language, { LANG: "ja_JP.UTF-8" }), { language })
  }
})

test("resolveLanguage: empty, null and undefined mean auto", () => {
  assert.deepEqual(resolveLanguage(undefined, { LANG: "ja_JP.UTF-8" }), { language: "ja" })
  assert.deepEqual(resolveLanguage(null, { LANG: "zh_CN.UTF-8" }), { language: "zh-CN" })
  assert.deepEqual(resolveLanguage("", { LANG: "zh_CN.UTF-8" }), { language: "zh-CN" })
})

test("resolveLanguage: unknown values fall back to the environment and report the value", () => {
  assert.deepEqual(resolveLanguage("ja-JP", { LANG: "zh_CN.UTF-8" }), { language: "zh-CN", problem: "ja-JP" })
  assert.deepEqual(resolveLanguage("english", {}), { language: "en", problem: "english" })
  assert.deepEqual(resolveLanguage(42, {}), { language: "en", problem: "42" })
})

test("resolveLanguage: LC_ALL overrides LANG, and unknown locales mean English", () => {
  assert.equal(resolveLanguage(undefined, { LC_ALL: "ja_JP.UTF-8", LANG: "zh_CN.UTF-8" }).language, "ja")
  assert.equal(resolveLanguage(undefined, { LC_ALL: "C", LANG: "ja_JP.UTF-8" }).language, "en")
  assert.equal(resolveLanguage(undefined, { LANG: "de_DE.UTF-8" }).language, "en")
  assert.equal(resolveLanguage(undefined, {}).language, "en")
})

test("isLanguage guards the wire values", () => {
  for (const language of LANGUAGE_VALUES) assert.equal(isLanguage(language), true)
  for (const value of ["en-US", "ja-JP", "zh", "", null, undefined, 1]) assert.equal(isLanguage(value), false)
})
