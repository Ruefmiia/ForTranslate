import { DEFAULT_SETTINGS, normalizeBaseUrl } from "../lib/config.js";
import { testConnection } from "../lib/api.js";
import {
  deleteGlossaryDraft,
  glossaryDraftFilename,
  glossaryDraftsToCsv,
  listGlossaryDrafts,
  saveGlossaryDraft
} from "../lib/glossary-drafts.js";

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const resultFontSize = document.querySelector("#result-font-size");
const resultFontSizeValue = document.querySelector("#result-font-size-value");
const draftList = document.querySelector("#draft-list");
const draftCount = document.querySelector("#draft-count");
const draftStatus = document.querySelector("#draft-status");

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

function draftField(labelText, name, value, maxLength) {
  const wrapper = document.createElement("label");
  wrapper.className = "draft-field";
  const label = document.createElement("span");
  label.textContent = labelText;
  const input = name === "note" ? document.createElement("textarea") : document.createElement("input");
  input.name = name;
  input.value = value;
  input.maxLength = maxLength;
  input.required = name !== "note";
  if (name === "note") input.className = "compact-textarea";
  wrapper.append(label, input);
  return wrapper;
}

async function renderDrafts() {
  const drafts = await listGlossaryDrafts();
  draftCount.textContent = `共 ${drafts.length} 条本地草稿`;
  draftList.replaceChildren();
  if (!drafts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "还没有术语草稿，可在翻译侧边栏中点击“记术语”。";
    draftList.appendChild(empty);
    return;
  }
  for (const draft of drafts) {
    const row = document.createElement("form");
    row.className = "draft-row";
    row.append(
      draftField("source", "source", draft.source, 200),
      draftField("target", "target", draft.target, 200),
      draftField("note", "note", draft.note, 500)
    );
    const actions = document.createElement("div");
    actions.className = "draft-row-actions";
    const saveButton = document.createElement("button");
    saveButton.className = "quiet-button";
    saveButton.type = "submit";
    saveButton.textContent = "保存";
    const deleteButton = document.createElement("button");
    deleteButton.className = "text-button danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`确认删除术语草稿“${draft.source}”？`)) return;
      await deleteGlossaryDraft(draft.id);
      draftStatus.textContent = `已删除：${draft.source}`;
      await renderDrafts();
    });
    actions.append(saveButton, deleteButton);
    row.appendChild(actions);
    row.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveGlossaryDraft({
          id: draft.id,
          source: row.elements.source.value,
          target: row.elements.target.value,
          note: row.elements.note.value
        });
        draftStatus.textContent = "术语草稿已更新";
        draftStatus.className = "status";
        await renderDrafts();
      } catch (error) {
        draftStatus.textContent = error.message;
        draftStatus.className = "status error";
      }
    });
    draftList.appendChild(row);
  }
}

document.querySelector("#export-drafts").addEventListener("click", async () => {
  const drafts = await listGlossaryDrafts();
  if (!drafts.length) {
    draftStatus.textContent = "没有可导出的术语草稿";
    return;
  }
  const url = URL.createObjectURL(new Blob([glossaryDraftsToCsv(drafts)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = glossaryDraftFilename();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  draftStatus.textContent = `已导出 ${drafts.length} 条 UTF-8 BOM CSV`;
});

load();
renderDrafts();
