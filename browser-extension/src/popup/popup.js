import { translateText } from "../lib/api.js";
import { getSettings } from "../lib/config.js";

const sourceInput = document.querySelector("#source-text");
const translateButton = document.querySelector("#translate");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const resultText = document.querySelector("#result-text");
const usage = document.querySelector("#usage");

document.querySelector("#open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

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
    status.textContent = "请先粘贴需要翻译的泰文";
    status.className = "status error";
    sourceInput.focus();
    return;
  }

  translateButton.disabled = true;
  translateButton.textContent = "正在理解语境…";
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
    translateButton.textContent = "翻译成自然中文";
  }
});

document.querySelector("#copy").addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(resultText.textContent);
  event.currentTarget.textContent = "已复制";
  setTimeout(() => { event.currentTarget.textContent = "复制译文"; }, 1200);
});
