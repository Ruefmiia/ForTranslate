import { getTokenBalance, translateText } from "../lib/api.js";
import { getSettings } from "../lib/config.js";
import { saveGlossaryDraft } from "../lib/glossary-drafts.js";
import { MAX_TEXT_CHARS } from "../lib/translation-rules.generated.js";

const sourceInput = document.querySelector("#source-text");
const sourceCount = document.querySelector("#source-count");
const sourceHelp = document.querySelector("#source-help");
const balance = document.querySelector("#balance");
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
const defaultSourceHelp = `单次最多 ${MAX_TEXT_CHARS.toLocaleString()} 个字符，超长内容请分段翻译。`;

sourceInput.maxLength = MAX_TEXT_CHARS;

getSettings().then((settings) => {
  const fontSize = Math.max(12, Math.min(Number(settings.resultFontSize) || 13, 18));
  document.documentElement.style.setProperty("--result-font-size", `${fontSize}px`);
});

function updateSourceCount() {
  const count = sourceInput.value.length;
  sourceCount.textContent = `${count.toLocaleString()} / ${MAX_TEXT_CHARS.toLocaleString()}`;
  const nearLimit = count >= Math.floor(MAX_TEXT_CHARS * 0.9);
  sourceCount.classList.toggle("warning", nearLimit);
  sourceHelp.classList.toggle("warning", nearLimit);
  if (sourceHelp.classList.contains("error") && count > 0) {
    sourceHelp.textContent = defaultSourceHelp;
    sourceHelp.className = nearLimit ? "field-help warning" : "field-help";
  }
}

function showSourceIssue(message) {
  sourceHelp.textContent = message;
  sourceHelp.className = "field-help error";
}

async function refreshBalance() {
  const settings = await getSettings();
  if (settings.translationMode === "direct") {
    balance.textContent = "自有 API 模式 · 费用由模型服务商结算";
    balance.className = "balance";
    return;
  }
  if (!settings.accessToken) {
    balance.textContent = "尚未配置服务令牌";
    balance.className = "balance warning";
    return;
  }
  try {
    const value = await getTokenBalance();
    balance.textContent = value?.unlimited
      ? "管理员令牌 · 不计额度"
      : `剩余额度 ¥${Number(value?.remaining_yuan || 0).toFixed(2)} · 已请求 ${Number(value?.requests || 0).toLocaleString()} 次`;
    balance.className = value?.exhausted ? "balance error" : "balance";
  } catch (error) {
    balance.textContent = error.message;
    balance.className = "balance error";
  }
}

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
    showSourceIssue("请输入或粘贴需要翻译的内容。");
    sourceInput.focus();
    return;
  }
  if (text.length > MAX_TEXT_CHARS) {
    status.textContent = `原文不能超过 ${MAX_TEXT_CHARS} 个字符，请缩短后重试`;
    status.className = "status error";
    showSourceIssue(`内容超过 ${MAX_TEXT_CHARS.toLocaleString()} 字，请缩短或分段翻译。`);
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
    usage.textContent = translated.cached
      ? "缓存命中 · 本次未调用模型"
      : Number.isFinite(inputTokens) ? `${inputTokens} 输入 · ${outputTokens || 0} 输出 Token` : "";
    result.hidden = false;
    await remember(text, translated.translation);
    await refreshBalance();
  } catch (error) {
    status.textContent = error.message;
    status.className = "status error";
  } finally {
    translateButton.disabled = false;
    translateButton.textContent = "翻译";
  }
});

sourceInput.addEventListener("input", updateSourceCount);
sourceInput.addEventListener("paste", (event) => {
  const pasted = event.clipboardData?.getData("text") || "";
  const selectedLength = (sourceInput.selectionEnd || 0) - (sourceInput.selectionStart || 0);
  const nextLength = sourceInput.value.length - selectedLength + pasted.length;
  if (nextLength <= MAX_TEXT_CHARS) return;
  event.preventDefault();
  showSourceIssue(
    `粘贴内容将达到 ${nextLength.toLocaleString()} 字，超过 ${MAX_TEXT_CHARS.toLocaleString()} 字限制，请分段粘贴。`
  );
});
updateSourceCount();
refreshBalance();

document.querySelector("#copy").addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(resultText.textContent);
  event.currentTarget.textContent = "已复制";
  setTimeout(() => { event.currentTarget.textContent = "复制译文"; }, 1200);
});
