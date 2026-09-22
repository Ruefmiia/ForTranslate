import { ApiError, codePointLength, createShortcutCredential, getShortcutConfig, getShortcutCredentials, getTokenBalance, revokeShortcutCredentials, testConnection, translateText } from "./api.js";
import { MAX_TEXT_CHARS } from "./translation-rules.generated.js";
import { addHistory, clearHistory, getHistory, getSettings, getToken, saveSettings, saveToken } from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const sourceInput = $("#source-text");
const sourceCount = $("#source-count");
const sourceError = $("#source-error");
const translateButton = $("#translate-button");
const resultPanel = $("#result-panel");
const resultEmpty = $("#result-empty");
const resultContent = $("#result-content");
const resultText = $("#result-text");
const resultMeta = $("#result-meta");
const resultDetails = $("#result-details");
const copyButton = $("#copy-button");
const globalStatus = $("#global-status");
const balance = $("#balance");
const settingsDialog = $("#settings-dialog");
const historyDialog = $("#history-dialog");
const installDialog = $("#install-dialog");
const shortcutDialog = $("#shortcut-dialog");
const tokenInput = $("#access-token");
const rememberToken = $("#remember-token");
const historyEnabled = $("#history-enabled");
const settingsError = $("#settings-error");
const saveSettingsButton = $("#save-settings");
const networkStatus = $("#network-status");
const installButton = $("#install-button");
const shortcutEndpoint = new URL("/v1/translate/text", window.location.origin).href;

let activeRequest = null;
let deferredInstallPrompt = null;
let toastTimer = null;
let shortcutInstallUrl = "";
let pendingShortcutCredential = "";

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function showToast(message) {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function showSourceError(message = "") {
  sourceError.textContent = message;
  sourceError.hidden = !message;
  sourceInput.setAttribute("aria-invalid", message ? "true" : "false");
}

function updateSourceCount() {
  const points = Array.from(sourceInput.value);
  if (points.length > MAX_TEXT_CHARS) {
    sourceInput.value = points.slice(0, MAX_TEXT_CHARS).join("");
    showSourceError(`已保留前 ${MAX_TEXT_CHARS.toLocaleString()} 个字符，超出部分未加入。`);
  } else if (sourceError.textContent.startsWith("已保留前")) {
    showSourceError();
  }
  const count = codePointLength(sourceInput.value);
  sourceCount.textContent = `${count.toLocaleString()} / ${MAX_TEXT_CHARS.toLocaleString()}`;
  sourceCount.classList.toggle("warning", count >= Math.floor(MAX_TEXT_CHARS * .9));
  sessionStorage.setItem("fortranslate.pwa.draft", sourceInput.value);
}

function setLoading(loading) {
  resultPanel.classList.toggle("loading", loading);
  resultPanel.setAttribute("aria-busy", String(loading));
  translateButton.classList.toggle("loading", loading);
  translateButton.querySelector(".button-label").textContent = loading ? "取消" : "翻译";
  sourceInput.readOnly = loading;
}

function setGlobalStatus(message = "", error = false) {
  globalStatus.textContent = message;
  globalStatus.classList.toggle("error", error);
}

function addDetails(title, values) {
  if (!values.length) return;
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const list = document.createElement("ul");
  summary.textContent = `${title} · ${values.length}`;
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  }
  details.append(summary, list);
  resultDetails.append(details);
}

function renderResult(result) {
  resultText.textContent = result.translation;
  resultDetails.replaceChildren();
  addDetails("说明", result.notes || []);
  addDetails("不确定项", result.uncertainties || []);
  addDetails("名称", result.entities || []);

  const inputTokens = Number(result.usage?.input_tokens || 0);
  const outputTokens = Number(result.usage?.output_tokens || 0);
  resultMeta.textContent = result.cached
    ? "缓存命中 · 本次未调用模型"
    : inputTokens > 0 ? `${inputTokens.toLocaleString()} 输入 · ${outputTokens.toLocaleString()} 输出 Token` : "翻译完成";
  resultEmpty.hidden = true;
  resultContent.hidden = false;
  copyButton.disabled = false;
}

function resetResult() {
  resultEmpty.hidden = false;
  resultContent.hidden = true;
  resultText.textContent = "";
  resultMeta.textContent = "";
  resultDetails.replaceChildren();
  copyButton.disabled = true;
}

async function refreshBalance() {
  const token = getToken();
  if (!token) {
    balance.className = "balance";
    balance.lastElementChild.textContent = "需要访问令牌";
    return;
  }
  try {
    const value = await getTokenBalance(token);
    balance.className = value.exhausted ? "balance error" : "balance";
    balance.lastElementChild.textContent = value.unlimited
      ? "管理员令牌 · 不限额"
      : `剩余 ¥${Number(value.remaining_yuan || 0).toFixed(2)} · ${Number(value.requests || 0).toLocaleString()} 次请求`;
  } catch (error) {
    balance.className = "balance error";
    balance.lastElementChild.textContent = error.message;
  }
}

async function runTranslation() {
  if (activeRequest) {
    activeRequest.abort();
    return;
  }
  const text = sourceInput.value.trim();
  if (!text) {
    showSourceError("请输入或粘贴需要翻译的内容。");
    sourceInput.focus();
    return;
  }
  if (codePointLength(text) > MAX_TEXT_CHARS) {
    showSourceError(`原文不能超过 ${MAX_TEXT_CHARS.toLocaleString()} 个字符。`);
    sourceInput.focus();
    return;
  }
  const token = getToken();
  if (!token) {
    openSettings();
    return;
  }

  showSourceError();
  setGlobalStatus();
  activeRequest = new AbortController();
  setLoading(true);
  try {
    const result = await translateText(token, text, activeRequest.signal);
    renderResult(result);
    if (getSettings().historyEnabled) addHistory(text, result.translation);
    setGlobalStatus(result.cached ? "已使用缓存结果。" : "翻译完成。", false);
    await refreshBalance();
  } catch (error) {
    const message = error instanceof Error ? error.message : "翻译失败，请稍后重试";
    setGlobalStatus(message, message !== "已取消翻译");
    if (error instanceof ApiError && error.statusCode === 401) openSettings();
  } finally {
    activeRequest = null;
    setLoading(false);
  }
}

function openSettings() {
  const settings = getSettings();
  tokenInput.value = getToken();
  rememberToken.checked = settings.rememberToken;
  historyEnabled.checked = settings.historyEnabled;
  settingsError.hidden = true;
  settingsError.textContent = "";
  openDialog(settingsDialog);
  setTimeout(() => tokenInput.focus(), 30);
}

function renderShortcutCredentialCount(count) {
  const countLabel = $("#shortcut-credential-count");
  const revokeButton = $("#revoke-shortcuts");
  countLabel.textContent = count ? `已有 ${count.toLocaleString()} 个专用凭证` : "暂无专用凭证";
  revokeButton.hidden = count === 0;
}

function showShortcutCredential(credential) {
  pendingShortcutCredential = credential;
  $("#shortcut-credential").textContent = credential;
  $("#shortcut-credential-output").hidden = false;
  const continueLink = $("#open-shortcut-install");
  continueLink.hidden = !shortcutInstallUrl;
  continueLink.href = shortcutInstallUrl || "#";
}

async function refreshShortcutSetup() {
  const token = getToken();
  const state = $("#shortcut-token-state");
  const prepareButton = $("#prepare-shortcut");
  const error = $("#shortcut-error");
  error.hidden = true;
  error.textContent = "";
  $("#shortcut-endpoint").textContent = shortcutEndpoint;
  if (!token) {
    state.className = "shortcut-token-state error";
    state.textContent = "请先在设置中保存访问令牌。";
    prepareButton.disabled = true;
    prepareButton.textContent = "需要访问令牌";
    renderShortcutCredentialCount(0);
    return;
  }

  state.className = "shortcut-token-state";
  state.textContent = "正在检查安装状态…";
  prepareButton.disabled = true;
  try {
    const [config, credentials] = await Promise.all([
      getShortcutConfig(),
      getShortcutCredentials(token)
    ]);
    shortcutInstallUrl = typeof config.install_url === "string" ? config.install_url : "";
    renderShortcutCredentialCount(Number(credentials.count || 0));
    state.className = shortcutInstallUrl ? "shortcut-token-state ready" : "shortcut-token-state";
    state.textContent = shortcutInstallUrl
      ? "已准备好。安装时只需粘贴一次专用凭证。"
      : "安装模板尚未发布，可先生成专用凭证并手动设置。";
    prepareButton.textContent = shortcutInstallUrl ? "复制凭证并安装" : "生成专用凭证";
    prepareButton.dataset.action = "install";
    prepareButton.disabled = false;
  } catch (requestError) {
    state.className = "shortcut-token-state error";
    state.textContent = "无法读取快捷翻译状态。";
    error.textContent = requestError.message;
    error.hidden = false;
    prepareButton.textContent = "重新检查";
    prepareButton.dataset.action = "retry";
    prepareButton.disabled = false;
  }
}

function openShortcutSetup() {
  pendingShortcutCredential = "";
  $("#shortcut-credential-output").hidden = true;
  closeDialog(settingsDialog);
  openDialog(shortcutDialog);
  refreshShortcutSetup();
}

async function copyShortcutValue(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
    return true;
  } catch {
    showToast("复制失败，请长按凭证手动复制");
    return false;
  }
}

async function prepareShortcutInstall() {
  const button = $("#prepare-shortcut");
  if (button.dataset.action === "retry") {
    await refreshShortcutSetup();
    return;
  }
  const token = getToken();
  if (!token) {
    closeDialog(shortcutDialog);
    openSettings();
    return;
  }
  const error = $("#shortcut-error");
  button.disabled = true;
  button.textContent = "正在准备…";
  error.hidden = true;
  try {
    const created = await createShortcutCredential(token);
    const credential = created.credential;
    const copied = await copyShortcutValue(credential, "专用凭证已复制");
    showShortcutCredential(credential);
    const current = await getShortcutCredentials(token);
    renderShortcutCredentialCount(Number(current.count || 0));
    if (shortcutInstallUrl && copied) {
      showToast("凭证已复制，安装时请粘贴");
      window.location.assign(shortcutInstallUrl);
      return;
    }
    $("#shortcut-token-state").textContent = copied
      ? "专用凭证已生成，请按手动设置使用。"
      : "专用凭证已生成，请长按复制后继续。";
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = shortcutInstallUrl ? "复制凭证并安装" : "重新生成专用凭证";
  }
}

async function revokeAllShortcutCredentials() {
  const token = getToken();
  if (!token || !window.confirm("停用后，已安装的 iOS 快捷翻译将无法使用。确定继续吗？")) return;
  const button = $("#revoke-shortcuts");
  button.disabled = true;
  try {
    const result = await revokeShortcutCredentials(token);
    pendingShortcutCredential = "";
    $("#shortcut-credential-output").hidden = true;
    renderShortcutCredentialCount(0);
    showToast(`已停用 ${Number(result.revoked || 0).toLocaleString()} 个专用凭证`);
  } catch (requestError) {
    const error = $("#shortcut-error");
    error.textContent = requestError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}
async function submitSettings(event) {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) {
    settingsError.textContent = "请填写访问令牌。";
    settingsError.hidden = false;
    tokenInput.focus();
    return;
  }
  saveSettingsButton.disabled = true;
  saveSettingsButton.textContent = "正在验证…";
  settingsError.hidden = true;
  try {
    await testConnection(token);
    saveToken(token, rememberToken.checked);
    saveSettings({ rememberToken: rememberToken.checked, historyEnabled: historyEnabled.checked });
    closeDialog(settingsDialog);
    showToast("设置已保存");
    await refreshBalance();
  } catch (error) {
    settingsError.textContent = error.message;
    settingsError.hidden = false;
    tokenInput.focus();
  } finally {
    saveSettingsButton.disabled = false;
    saveSettingsButton.textContent = "验证并保存";
  }
}

function renderHistory() {
  const list = $("#history-list");
  list.replaceChildren();
  if (!getSettings().historyEnabled) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "历史记录已关闭。";
    list.append(empty);
    $("#clear-history").hidden = true;
    return;
  }
  const entries = getHistory();
  $("#clear-history").hidden = entries.length === 0;
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "暂无记录。";
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-entry";
    const source = document.createElement("strong");
    const translation = document.createElement("span");
    const time = document.createElement("time");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    source.textContent = entry.source;
    translation.textContent = entry.translation;
    time.dateTime = entry.createdAt;
    time.textContent = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt));
    use.setAttribute("href", "#icon-chevron");
    icon.setAttribute("aria-hidden", "true");
    icon.append(use);
    button.append(source, translation, time, icon);
    button.addEventListener("click", () => {
      sourceInput.value = entry.source;
      updateSourceCount();
      renderResult({ translation: entry.translation, notes: [], uncertainties: [], entities: [], usage: null, cached: false });
      resultMeta.textContent = "历史记录";
      closeDialog(historyDialog);
      sourceInput.focus();
    });
    list.append(button);
  }
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  networkStatus.classList.toggle("offline", !online);
  networkStatus.lastElementChild.textContent = online ? "在线" : "离线";
  translateButton.disabled = !online;
  if (!online) setGlobalStatus("当前离线，无法翻译。", true);
  else if (globalStatus.textContent.startsWith("当前离线")) setGlobalStatus();
}

function setupInstall() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios) installButton.hidden = false;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      openDialog(installDialog);
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
}

function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showToast("新版本已就绪，下次打开时生效");
          }
        });
      });
    } catch {
      setGlobalStatus("离线功能暂不可用。", true);
    }
  });
}

sourceInput.value = sessionStorage.getItem("fortranslate.pwa.draft") || "";
sourceInput.addEventListener("input", updateSourceCount);
sourceInput.addEventListener("paste", (event) => {
  const pasted = event.clipboardData?.getData("text") || "";
  const before = sourceInput.value.slice(0, sourceInput.selectionStart ?? 0);
  const after = sourceInput.value.slice(sourceInput.selectionEnd ?? 0);
  if (codePointLength(before + pasted + after) <= MAX_TEXT_CHARS) return;
  event.preventDefault();
  showSourceError(`粘贴内容超过 ${MAX_TEXT_CHARS.toLocaleString()} 字限制，请分段粘贴。`);
});

translateButton.addEventListener("click", runTranslation);
$("#paste-button").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    const next = sourceInput.value + text;
    if (codePointLength(next) > MAX_TEXT_CHARS) {
      showSourceError(`剪贴板内容加入后会超过 ${MAX_TEXT_CHARS.toLocaleString()} 字限制。`);
      return;
    }
    sourceInput.value = next;
    updateSourceCount();
    sourceInput.focus();
  } catch {
    showToast("浏览器未允许读取剪贴板，请长按输入框粘贴");
    sourceInput.focus();
  }
});
$("#clear-button").addEventListener("click", () => {
  sourceInput.value = "";
  updateSourceCount();
  showSourceError();
  resetResult();
  sourceInput.focus();
});
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultText.textContent);
    showToast("译文已复制");
  } catch {
    showToast("复制失败，请长按译文手动复制");
  }
});

$("#settings-button").addEventListener("click", openSettings);
$("#settings-form").addEventListener("submit", submitSettings);
$("#ios-shortcut-button").addEventListener("click", openShortcutSetup);
$("#prepare-shortcut").addEventListener("click", prepareShortcutInstall);
$("#copy-shortcut-credential").addEventListener("click", async () => {
  if (pendingShortcutCredential) {
    await copyShortcutValue(pendingShortcutCredential, "专用凭证已复制");
  }
});
$("#revoke-shortcuts").addEventListener("click", revokeAllShortcutCredentials);
$("#toggle-token").addEventListener("click", (event) => {
  const show = tokenInput.type === "password";
  tokenInput.type = show ? "text" : "password";
  event.currentTarget.setAttribute("aria-pressed", String(show));
  event.currentTarget.setAttribute("aria-label", show ? "隐藏访问令牌" : "显示访问令牌");
});
$("#history-button").addEventListener("click", () => {
  renderHistory();
  openDialog(historyDialog);
});
$("#clear-history").addEventListener("click", () => {
  if (!window.confirm("确定清空历史吗？")) return;
  clearHistory();
  renderHistory();
  showToast("历史已清空");
});

for (const button of document.querySelectorAll(".dialog-close")) {
  button.addEventListener("click", () => closeDialog(button.closest("dialog")));
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
}

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
updateSourceCount();
updateNetworkStatus();
setupInstall();
setupServiceWorker();

if (getToken()) refreshBalance();
else setTimeout(openSettings, 150);
