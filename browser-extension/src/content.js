(() => {
  if (window.__forTranslateLoaded) return;
  window.__forTranslateLoaded = true;

  const host = document.createElement("div");
  host.id = "fortranslate-root";
  const shadow = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .ft-trigger {
        position: fixed; z-index: 2147483647; width: 42px; height: 42px; border: 0;
        border-radius: 14px; background: #15324a; color: #fff; cursor: pointer;
        box-shadow: 0 8px 24px rgba(10, 34, 52, .24); font: 700 15px/1 system-ui, sans-serif;
        display: none; place-items: center; transition: transform 160ms ease, background 160ms ease;
      }
      .ft-trigger:hover { transform: translateY(-2px); background: #1d435f; }
      .ft-trigger:focus-visible, button:focus-visible { outline: 3px solid #f4a261; outline-offset: 2px; }
      .ft-panel {
        position: fixed; z-index: 2147483647; width: min(380px, calc(100vw - 24px));
        max-height: min(520px, calc(100vh - 24px)); overflow: auto; display: none;
        background: #fbfcfe; color: #142532; border: 1px solid #cbd8e2; border-radius: 20px;
        box-shadow: 0 22px 64px rgba(10, 34, 52, .24); font: 14px/1.6 system-ui, "Noto Sans Thai", sans-serif;
      }
      .ft-panel[aria-hidden="false"] { display: block; animation: ft-in 180ms ease-out; }
      .ft-head { padding: 14px 16px 11px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e9ef; }
      .ft-brand { display: flex; gap: 9px; align-items: center; font-weight: 750; letter-spacing: -.01em; }
      .ft-mark { color: #d45c2d; font-size: 18px; line-height: 1; transform: translateY(-2px); }
      .ft-close, .ft-copy { border: 0; background: transparent; color: #526775; cursor: pointer; border-radius: 9px; min-width: 36px; min-height: 36px; }
      .ft-close:hover, .ft-copy:hover { background: #edf2f5; color: #142532; }
      .ft-body { padding: 16px; }
      .ft-label { color: #667b89; font: 650 11px/1.2 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
      .ft-source { margin: 7px 0 16px; color: #526775; font-size: 12px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .ft-result { margin: 7px 0 0; font-size: 16px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
      .ft-actions { margin-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .ft-copy { padding: 0 11px; border: 1px solid #cbd8e2; color: #254052; font-weight: 650; }
      .ft-status { color: #667b89; font-size: 12px; }
      .ft-error { padding: 12px; border-radius: 12px; background: #fff0eb; color: #942f16; }
      .ft-loader { display: flex; gap: 6px; align-items: center; color: #526775; }
      .ft-dot { width: 7px; height: 7px; background: #d45c2d; border-radius: 50%; animation: ft-pulse 900ms infinite alternate; }
      .ft-dot:nth-child(2) { animation-delay: 180ms; } .ft-dot:nth-child(3) { animation-delay: 360ms; }
      .ft-notes { margin: 15px 0 0; padding: 12px 12px 12px 28px; background: #edf4f7; border-radius: 12px; color: #3c5362; font-size: 12px; }
      @keyframes ft-in { from { opacity: 0; transform: translateY(7px) scale(.98); } }
      @keyframes ft-pulse { to { opacity: .25; transform: translateY(-2px); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
    </style>
    <button class="ft-trigger" type="button" aria-label="翻译选中文字">译</button>
    <section class="ft-panel" role="dialog" aria-label="ForTranslate 翻译结果" aria-hidden="true">
      <header class="ft-head">
        <div class="ft-brand"><span class="ft-mark" aria-hidden="true">่</span><span>ForTranslate</span></div>
        <button class="ft-close" type="button" aria-label="关闭翻译结果">✕</button>
      </header>
      <div class="ft-body"></div>
    </section>`;

  const trigger = shadow.querySelector(".ft-trigger");
  const panel = shadow.querySelector(".ft-panel");
  const body = shadow.querySelector(".ft-body");
  let selectedText = "";

  function readSelection(target = document.activeElement) {
    if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && /^(text|search|url|tel|email)$/i.test(target.type))) {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      return target.value.slice(start, end).trim();
    }
    return window.getSelection()?.toString().trim() || "";
  }

  function selectionRect(target) {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return target.getBoundingClientRect();
    const selection = window.getSelection();
    return selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : target.getBoundingClientRect();
  }

  function hideTrigger() { trigger.style.display = "none"; }
  function hidePanel() { panel.setAttribute("aria-hidden", "true"); }
  function position(element, rect, width = 380) {
    const gap = 10;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const below = rect.bottom + gap;
    const top = below + 250 < window.innerHeight ? below : Math.max(12, rect.top - 270);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  function showPanel() {
    const selection = window.getSelection();
    const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : { left: 12, top: 12, bottom: 12 };
    position(panel, rect);
    panel.setAttribute("aria-hidden", "false");
  }

  function renderLoading(sourceText) {
    body.innerHTML = `<div class="ft-label">原文</div><div class="ft-source"></div><div class="ft-loader"><span class="ft-dot"></span><span class="ft-dot"></span><span class="ft-dot"></span><span>正在理解语境…</span></div>`;
    body.querySelector(".ft-source").textContent = sourceText;
    showPanel();
  }

  function renderError(message) {
    body.innerHTML = `<div class="ft-error" role="alert"></div><div class="ft-actions"><span class="ft-status">可在扩展设置中检查服务地址</span></div>`;
    body.querySelector(".ft-error").textContent = message;
    showPanel();
  }

  function renderResult(result, sourceText) {
    body.innerHTML = `<div class="ft-label">原文</div><div class="ft-source"></div><div class="ft-label">自然中文</div><div class="ft-result"></div><div class="ft-notes" hidden></div><div class="ft-actions"><span class="ft-status"></span><button class="ft-copy" type="button">复制译文</button></div>`;
    body.querySelector(".ft-source").textContent = sourceText;
    body.querySelector(".ft-result").textContent = result.translation;
    const notes = [...(result.notes || []), ...(result.uncertainties || [])];
    if (notes.length) {
      const notesNode = body.querySelector(".ft-notes");
      notesNode.hidden = false;
      notesNode.textContent = notes.map((item) => typeof item === "string" ? item : item.explanation || item.reason || item.text).filter(Boolean).join(" · ");
    }
    body.querySelector(".ft-copy").addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(result.translation);
      event.currentTarget.textContent = "已复制";
    });
    showPanel();
  }

  document.addEventListener("mouseup", (event) => {
    if (host.contains(event.target)) return;
    setTimeout(() => {
      const text = readSelection(event.target);
      if (!text || text.length > 10000) return hideTrigger();
      selectedText = text;
      const rect = selectionRect(event.target);
      position(trigger, rect, 42);
      trigger.style.display = "grid";
    }, 0);
  });

  document.addEventListener("mousedown", (event) => {
    if (!host.contains(event.target)) hideTrigger();
  });

  trigger.addEventListener("click", () => {
    hideTrigger();
    renderLoading(selectedText);
    chrome.runtime.sendMessage({ type: "TRANSLATE_TEXT", text: selectedText });
  });
  shadow.querySelector(".ft-close").addEventListener("click", hidePanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { hideTrigger(); hidePanel(); }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_SELECTION") {
      sendResponse({ text: readSelection() });
    } else if (message.type === "TRANSLATION_LOADING") {
      renderLoading(message.sourceText);
    } else if (message.type === "TRANSLATION_SUCCESS") {
      renderResult(message.result, message.sourceText);
    } else if (message.type === "TRANSLATION_ERROR") {
      renderError(message.message);
    }
  });
})();
