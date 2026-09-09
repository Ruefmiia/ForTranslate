import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "translation-rules.json");
const rules = JSON.parse(await readFile(sourcePath, "utf8"));
const checkOnly = process.argv.includes("--check");

if (
  typeof rules.version !== "string" ||
  !Number.isInteger(rules.max_text_chars) ||
  rules.max_text_chars < 1 ||
  !Number.isInteger(rules.max_matched_terms) ||
  rules.max_matched_terms < 1 ||
  typeof rules.system_prompt !== "string" ||
  !rules.system_prompt.trim()
) {
  throw new Error("translation-rules.json is invalid");
}

const quoted = JSON.stringify;
const dartQuoted = (value) => JSON.stringify(value).replaceAll("$", "\\$");
const kotlinQuoted = (value) => JSON.stringify(value).replaceAll("$", "\\$");
const banner = "Generated from translation-rules.json. Do not edit by hand.";
const outputs = new Map([
  [
    "backend/fortranslate_backend/translation_rules_generated.py",
    `# ${banner}
RULES_VERSION = ${quoted(rules.version)}
MAX_TEXT_CHARS = ${rules.max_text_chars}
MAX_MATCHED_TERMS = ${rules.max_matched_terms}
SYSTEM_PROMPT = ${quoted(rules.system_prompt)}
`,
  ],
  [
    "browser-extension/src/lib/translation-rules.generated.js",
    `// ${banner}
export const TRANSLATION_RULES_VERSION = ${quoted(rules.version)};
export const MAX_TEXT_CHARS = ${rules.max_text_chars};
export const MAX_MATCHED_TERMS = ${rules.max_matched_terms};
export const SYSTEM_PROMPT = ${quoted(rules.system_prompt)};
`,
  ],
  [
    "browser-extension/src/translation-rules-content.generated.js",
    `// ${banner}
globalThis.ForTranslateRules = Object.freeze({
  version: ${quoted(rules.version)},
  maxTextChars: ${rules.max_text_chars}
});
`,
  ],
  [
    "mobile-app/lib/translation_rules_generated.dart",
    `// ${banner}
const String translationRulesVersion = ${dartQuoted(rules.version)};
const int maxTranslationChars = ${rules.max_text_chars};
const int maxMatchedTerms = ${rules.max_matched_terms};
const String translationSystemPrompt = ${dartQuoted(rules.system_prompt)};
`,
  ],
  [
    "mobile-app/android/app/src/main/kotlin/com/ruefmiia/fortranslate/TranslationRulesGenerated.kt",
    `// ${banner}
package com.ruefmiia.fortranslate

object TranslationRules {
    const val VERSION = ${kotlinQuoted(rules.version)}
    const val MAX_TEXT_CHARS = ${rules.max_text_chars}
    const val MAX_MATCHED_TERMS = ${rules.max_matched_terms}
    const val SYSTEM_PROMPT = ${kotlinQuoted(rules.system_prompt)}
}
`,
  ],
]);

let stale = false;
for (const [relativePath, expected] of outputs) {
  const path = resolve(root, relativePath);
  if (checkOnly) {
    const actual = await readFile(path, "utf8").catch(() => "");
    if (actual.replaceAll("\r\n", "\n") !== expected) {
      console.error(`Generated translation rules are stale: ${relativePath}`);
      stale = true;
    }
  } else {
    await writeFile(path, expected, "utf8");
    console.log(`Generated ${relativePath}`);
  }
}

if (stale) process.exitCode = 1;
