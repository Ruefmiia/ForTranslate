# ForTranslate 轻量后端

FastAPI + SQLite 实现的私有中文翻译服务，以泰语和泰娱内容为重点，兼容浏览器扩展和手机端，并可连接任何实现 OpenAI Chat Completions 协议的模型服务。

## 启动

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
# 按 .env.example 设置进程环境变量后：
.venv\Scripts\uvicorn fortranslate_backend.app:app --host 127.0.0.1 --port 8787
```

服务读取以下环境变量：

- `FORTRANSLATE_ACCESS_TOKEN`：兼容旧客户端的全局 Bearer Token；可与 SQLite 独立令牌同时使用。
- `FORTRANSLATE_LLM_API_KEY`：大模型 API Key；必填。
- `FORTRANSLATE_LLM_BASE_URL`：兼容 OpenAI 的 API 根地址，默认 `https://api.openai.com/v1`。
- `FORTRANSLATE_LLM_MODEL`：支持文本和图片输入的模型名。
- `FORTRANSLATE_LLM_THINKING`：可选值 `enabled` 或 `disabled`；DeepSeek 翻译建议设为 `disabled`。
- `FORTRANSLATE_DATABASE_PATH`：SQLite 文件路径。
- `FORTRANSLATE_MAX_IMAGE_BYTES`：图片上限，默认 10MB。
- `FORTRANSLATE_MAX_TEXT_CHARS`：单次翻译原文字符数上限，默认 3000；超限请求在调用模型前返回 413。
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

## 独立访问令牌

可以为每位使用者创建独立令牌。数据库只保存 SHA-256 摘要，完整令牌仅在创建时显示一次：

```bash
python -m fortranslate_backend.token_cli create "Android 用户"
python -m fortranslate_backend.token_cli list
python -m fortranslate_backend.token_cli disable 1
python -m fortranslate_backend.token_cli enable 1
python -m fortranslate_backend.token_cli revoke 1
```

所有令牌继续使用 `Authorization: Bearer <token>`。环境变量中的旧全局令牌保持兼容，部署升级不会中断现有扩展。

## 测试

```powershell
pip install -r requirements-dev.txt
python -m pytest
```
