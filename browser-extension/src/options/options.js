import { DEFAULT_SETTINGS, normalizeBaseUrl } from "../lib/config.js";
import { testConnection } from "../lib/api.js";

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const resultFontSize = document.querySelector("#result-font-size");
const resultFontSizeValue = document.querySelector("#result-font-size-value");

function showResultFontSize() {
  resultFontSizeValue.textContent = `${resultFontSize.value}px`;
}

async function load() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  form.apiBaseUrl.value = settings.apiBaseUrl;
  form.accessToken.value = settings.accessToken;
  form.requestTimeoutMs.value = settings.requestTimeoutMs;
  resultFontSize.value = settings.resultFontSize;
  showResultFontSize();
  document.querySelector("#save-history").checked = settings.saveHistory;
}

async function saveSettings() {
  const apiBaseUrl = normalizeBaseUrl(form.apiBaseUrl.value);
  if (!/^https?:\/\//i.test(apiBaseUrl)) {
    throw new Error("服务地址需要以 http:// 或 https:// 开头");
  }
  await chrome.storage.local.set({
    apiBaseUrl,
    accessToken: form.accessToken.value.trim(),
    requestTimeoutMs: Number(form.requestTimeoutMs.value),
    resultFontSize: Math.max(12, Math.min(Number(resultFontSize.value) || 13, 18)),
    saveHistory: document.querySelector("#save-history").checked
  });
}

function showStatus(message, error = false) {
  status.textContent = message;
  status.className = error ? "status error" : "status";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveSettings();
    showStatus("设置已保存");
  } catch (error) {
    showStatus(error.message, true);
  }
});

document.querySelector("#test").addEventListener("click", async () => {
  showStatus("正在连接…");
  try {
    await saveSettings();
    await testConnection();
    showStatus("连接成功，翻译服务可以使用");
  } catch (error) {
    showStatus(error.message, true);
  }
});

document.querySelector("#clear-history").addEventListener("click", async () => {
  await chrome.storage.local.remove("history");
  showStatus("最近翻译已清空");
});

resultFontSize.addEventListener("input", showResultFontSize);

load();
