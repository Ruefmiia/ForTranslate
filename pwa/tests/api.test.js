import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, codePointLength, createShortcutCredential, getShortcutConfig, getShortcutCredentials, normalizeResult, revokeShortcutCredentials, serviceError } from "../src/api.js";

test("字符计数按 Unicode 码点计算，与 Python 后端一致", () => {
  assert.equal(codePointLength("A😀ก"), 3);
});

test("规范化后端翻译结果", () => {
  assert.deepEqual(normalizeResult({
    translation: " 你好 ",
    notes: ["语气自然化"],
    uncertainties: null,
    entities: [42],
    usage: { input_tokens: 8, output_tokens: 3 },
    cached: true
  }), {
    translation: "你好",
    notes: ["语气自然化"],
    uncertainties: [],
    entities: ["42"],
    usage: { input_tokens: 8, output_tokens: 3 },
    cached: true
  });
});

test("拒绝无法识别的翻译结果", () => {
  assert.throws(() => normalizeResult({ notes: [] }), ApiError);
});

test("常见服务错误提供明确中文提示", () => {
  assert.match(serviceError(401), /令牌/);
  assert.match(serviceError(413), /3,000/);
  assert.match(serviceError(429), /额度/);
  assert.match(serviceError(502), /模型服务/);
});


test("快捷指令安装配置公开读取，凭证管理始终携带主令牌", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path, options) => {
    requests.push({ path, options });
    const payload = path.endsWith("/config")
      ? { install_url: "https://www.icloud.com/shortcuts/example" }
      : options.method === "POST"
        ? { credential: "fts_example", scope: "translate:text" }
        : options.method === "DELETE"
          ? { revoked: 1 }
          : { credentials: [], count: 0 };
    return new Response(JSON.stringify(payload), {
      status: options.method === "POST" ? 201 : 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    assert.equal((await getShortcutConfig()).install_url, "https://www.icloud.com/shortcuts/example");
    assert.equal((await getShortcutCredentials("main-token")).count, 0);
    assert.equal((await createShortcutCredential("main-token")).credential, "fts_example");
    assert.equal((await revokeShortcutCredentials("main-token")).revoked, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0].options.headers.has("Authorization"), false);
  for (const request of requests.slice(1)) {
    assert.equal(request.options.headers.get("Authorization"), "Bearer main-token");
  }
  assert.deepEqual(requests.map(({ options }) => options.method), ["GET", "GET", "POST", "DELETE"]);
});