import { translateText } from "../lib/api.js";
import { getSettings } from "../lib/config.js";
import { saveGlossaryDraft } from "../lib/glossary-drafts.js";

const sourceInput = document.querySelector("#source-text");
const translateButton = document.querySelector("#translate");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const resultText = document.querySelector("#result-text");
const usage = document.querySelector("#usage");
const termForm = document.querySelector("#term-form");
const termStatus = document.querySelector("#term-status");
const termSource = document.querySelector("#term-source");
const termTarget = document.querySelector("#term-target");
const termNote = document.querySelector("#term-note");

getSettings().then((settings) => {
  const fontSize = Math.max(12, Math.min(Number(settings.resultFontSize) || 13, 18));
  document.documentElement.style.setProperty("--result-font-size", `${fontSize}px`);
});

document.querySelector("#version").textContent = `v${chrome.runtime.getManifest().version}`;

document.querySelector("#open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

function openTermForm(prefill = false) {
  termForm.hidden = false;
  termSource.value = prefill ? sourceInput.value.trim().slice(0, 200) : "";
  termTarget.value = prefill ? resultText.textContent.trim().slice(0, 200) : "";
  termNote.value = "";
  termStatus.textContent = "";
  termStatus.className = "status";
  termSource.focus();
}

document.querySelector("#record-term").addEventListener("click", () => openTermForm(false));
document.querySelector("#record-result-term").addEventListener("click", () => openTermForm(true));
document.querySelector("#cancel-term").addEventListener("click", () => { termForm.hidden = true; });

termForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = termForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  termStatus.textContent = "正在保存…";
  try {
    await saveGlossaryDraft({
      source: termSource.value,
      target: termTarget.value,
      note: termNote.value
    });
    termStatus.textContent = "已暂存，可在设置页管理和导出 CSV";
    termStatus.className = "status";
    termForm.reset();
  } catch (error) {
    termStatus.textContent = error.message;
    termStatus.className = "status error";
  } finally {
    submitButton.disabled = false;
  }
});

async function remember(source, translated) {
  const settings = await getSettings();
  if (!settings.saveHistory) return;
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  history.unshift({ id: crypto.randomUUID(), kind: "text", source, translation: translated, createdAt: new Date().toISOString() });
  await chrome.storage.local.set({ history: history.slice(0, 50) });
}

translateButton.addEventListener("click", async () => {
  const text = sourceInput.value.trim();
  if (!text) {
    status.textContent = "请先粘贴需要翻译的内容";
    status.className = "status error";
    sourceInput.focus();
    return;
  }

  translateButton.disabled = true;
  translateButton.textContent = "翻译中…";
  status.textContent = "";
  status.className = "status";
  result.hidden = true;
  try {
    const translated = await translateText(text);
    resultText.textContent = translated.translation;
    const inputTokens = translated.usage?.input_tokens;
    const outputTokens = translated.usage?.output_tokens;
    usage.textContent = Number.isFinite(inputTokens) ? `${inputTokens} 输入 · ${outputTokens || 0} 输出 Token` : "";
    result.hidden = false;
    await remember(text, translated.translation);
  } catch (error) {
    status.textContent = error.message;
    status.className = "status error";
  } finally {
    translateButton.disabled = false;
    translateButton.textContent = "翻译";
  }
});

document.querySelector("#copy").addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(resultText.textContent);
  event.currentTarget.textContent = "已复制";
  setTimeout(() => { event.currentTarget.textContent = "复制译文"; }, 1200);
});
