import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const glossary = JSON.parse(await readFile("assets/glossary.json", "utf8"));
const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.side_panel?.default_path,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((entry) => entry.js)
].filter(Boolean);

for (const file of referencedFiles) await access(file);

for (const file of [
  "src/background.js",
  "src/content.js",
  "src/lib/api.js",
  "src/lib/config.js",
  "src/lib/glossary-drafts.js",
  "src/popup/popup.js",
  "src/options/options.js"
]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required");
if (!manifest.permissions.includes("sidePanel")) throw new Error("Side Panel permission is required");
if (manifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: manifest ${manifest.version}, package ${packageJson.version}`);
}
if (glossary.version !== "1.2.1" || glossary.terms.length !== 220) {
  throw new Error("Bundled glossary 1.2.1 with 220 terms is required");
}
const {
  glossaryDraftFilename,
  glossaryDraftsToCsv,
  listGlossaryDrafts,
  saveGlossaryDraft
} = await import("../src/lib/glossary-drafts.js");
const csv = glossaryDraftsToCsv([{ source: 'ปอนด์', target: 'Pond, 庞德', note: '昵称"测试' }]);
if (!csv.startsWith('\uFEFF"source","target","note"\r\n')) throw new Error("Glossary CSV must be UTF-8 BOM compatible");
if (!csv.includes('"Pond, 庞德"') || !csv.includes('"昵称""测试"')) throw new Error("Glossary CSV escaping failed");
if (glossaryDraftFilename(new Date(2026, 7, 29)) !== "fortranslate-glossary-draft-20260829.csv") {
  throw new Error("Glossary CSV filename failed");
}
let storedDrafts = [];
globalThis.chrome = { storage: { local: {
  async get(defaults) { return { ...defaults, glossaryDrafts: storedDrafts }; },
  async set(values) { storedDrafts = values.glossaryDrafts; }
} } };
await saveGlossaryDraft({ source: "ปอนด์", target: "Pond", note: "昵称" });
await saveGlossaryDraft({ source: "ปอนด์", target: "庞德", note: "更新" });
if ((await listGlossaryDrafts()).length !== 1 || storedDrafts[0].target !== "庞德") {
  throw new Error("Glossary draft upsert failed");
}
console.log(`Validated extension ${manifest.version}, ${referencedFiles.length} manifest references and JavaScript syntax.`);
