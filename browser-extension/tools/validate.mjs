import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((entry) => entry.js)
].filter(Boolean);

for (const file of referencedFiles) await access(file);

for (const file of [
  "src/background.js",
  "src/content.js",
  "src/lib/api.js",
  "src/lib/config.js",
  "src/popup/popup.js",
  "src/options/options.js"
]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required");
if (manifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: manifest ${manifest.version}, package ${packageJson.version}`);
}
console.log(`Validated extension ${manifest.version}, ${referencedFiles.length} manifest references and JavaScript syntax.`);
