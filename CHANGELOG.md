# Changelog

本项目按组件独立记录版本。版本格式遵循 Semantic Versioning。

## Backend 0.2.0 - 2026-08-29

- 增加 Chrome/Edge 扩展访问本地或私有网络服务所需的 PNA 预检支持。
- 增加 `FORTRANSLATE_LLM_THINKING`，可关闭 DeepSeek 思考模式。
- 完成 Ubuntu、systemd、SQLite 和公网专用端口部署验证。

## Backend 0.1.0 - 2026-08-29

- 提供 Bearer Token 认证。
- 提供 SQLite 术语库和 Token 用量统计。
- 提供 OpenAI Chat Completions 兼容的文本与图片翻译接口。

## Extension 0.1.0 - 2026-08-27

- 首个浏览器扩展 MVP。
- 支持选区、右键、快捷键、弹窗文本及图片翻译入口。
- 支持配置私有服务地址、访问令牌和本地历史记录。
