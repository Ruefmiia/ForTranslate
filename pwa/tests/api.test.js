import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, codePointLength, normalizeResult, serviceError } from "../src/api.js";

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
