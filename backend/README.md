# ForTranslate 轻量后端

FastAPI + SQLite 实现的私有翻译服务，兼容现有浏览器扩展，并可连接任何实现 OpenAI Chat Completions 协议的多模态模型服务。

## 启动

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
# 按 .env.example 设置进程环境变量后：
.venv\Scripts\uvicorn fortranslate_backend.app:app --host 127.0.0.1 --port 8787
```

服务读取以下环境变量：

- `FORTRANSLATE_ACCESS_TOKEN`：扩展访问后端时使用的 Bearer Token；必填，未配置时接口返回 503。
- `FORTRANSLATE_LLM_API_KEY`：大模型 API Key；必填。
- `FORTRANSLATE_LLM_BASE_URL`：兼容 OpenAI 的 API 根地址，默认 `https://api.openai.com/v1`。
- `FORTRANSLATE_LLM_MODEL`：支持文本和图片输入的模型名。
- `FORTRANSLATE_LLM_THINKING`：可选值 `enabled` 或 `disabled`；DeepSeek 翻译建议设为 `disabled`。
- `FORTRANSLATE_DATABASE_PATH`：SQLite 文件路径。
- `FORTRANSLATE_MAX_IMAGE_BYTES`：图片上限，默认 10MB。
- `FORTRANSLATE_REQUEST_TIMEOUT_SECONDS`：上游请求超时秒数。

项目不主动加载 `.env`，避免引入额外依赖；可通过 PowerShell、Docker 或进程管理器注入环境变量。

## API

所有接口均要求 `Authorization: Bearer <access-token>`。

- `GET /health`：健康检查。
- `POST /v1/translate/text`：自然文本翻译，参数兼容扩展现有契约。
- `POST /v1/translate/image`：多模态图片识别与翻译，multipart 字段为 `image`、`source`。
- `GET /v1/glossary`：列出术语。
- `PUT /v1/glossary`：按源词新增或更新术语，JSON 字段为 `source`、`target`、`note`。
- `DELETE /v1/glossary/{id}`：删除术语。
- `GET /v1/usage`：汇总请求数和模型输入、输出 Token。

文本翻译只注入在原文或上下文中命中的术语；图片翻译因 OCR 在模型侧完成，会注入完整术语表。Token 数据采用上游返回的 usage，按请求持久化到 SQLite。

## 测试

```powershell
pip install -r requirements-dev.txt
python -m pytest
```
