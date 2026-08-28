import { translateImageUrl, translateText } from "./lib/api.js";
import { getSettings } from "./lib/config.js";

const MENU_SELECTION = "fortranslate-selection";
const MENU_IMAGE = "fortranslate-image";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: "翻译选中文字",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: MENU_IMAGE,
      title: "翻译这张图片",
      contexts: ["image"]
    });
  });
});

async function saveHistory(source, result, kind) {
  const settings = await getSettings();
  if (!settings.saveHistory) return;
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  history.unshift({
    id: crypto.randomUUID(),
    kind,
    source: kind === "image" ? "[图片]" : source,
    translation: result.translation,
    createdAt: new Date().toISOString()
  });
  await chrome.storage.local.set({ history: history.slice(0, 50) });
}

async function sendToTab(tabId, message) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Internal browser pages do not allow content scripts.
  }
}

async function runTextTranslation(text, tabId) {
  await sendToTab(tabId, { type: "TRANSLATION_LOADING", sourceText: text });
  try {
    const result = await translateText(text);
    await saveHistory(text, result, "text");
    await sendToTab(tabId, { type: "TRANSLATION_SUCCESS", result, sourceText: text });
    return result;
  } catch (error) {
    await sendToTab(tabId, { type: "TRANSLATION_ERROR", message: error.message });
    throw error;
  }
}

async function runImageTranslation(imageUrl, tabId) {
  await sendToTab(tabId, { type: "TRANSLATION_LOADING", sourceText: "正在识别图片中的泰文…" });
  try {
    const result = await translateImageUrl(imageUrl);
    await saveHistory("[图片]", result, "image");
    await sendToTab(tabId, { type: "TRANSLATION_SUCCESS", result, sourceText: "图片翻译" });
  } catch (error) {
    await sendToTab(tabId, { type: "TRANSLATION_ERROR", message: error.message });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_SELECTION && info.selectionText) {
    runTextTranslation(info.selectionText.trim(), tab?.id).catch(() => {});
  }
  if (info.menuItemId === MENU_IMAGE && info.srcUrl) {
    runImageTranslation(info.srcUrl, tab?.id);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "translate-selection" || !tab?.id) return;
  const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }).catch(() => null);
  if (response?.text) runTextTranslation(response.text, tab.id).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRANSLATE_TEXT") {
    runTextTranslation(message.text.trim(), sender.tab?.id)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
