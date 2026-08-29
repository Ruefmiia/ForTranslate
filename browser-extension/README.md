# ForTranslation翻译 浏览器扩展

以泰语和泰娱内容为重点的自然中文翻译扩展。当前版本支持：

- 选中文字后点击浮动“译”按钮
- 翻译浮窗跟随原文，原文离屏后自动吸附右下角；支持拖动、方向键移动和尺寸调整
- 保留网页中以图片呈现的 Emoji，并可在设置中调整中文译文字号
- 记录、编辑和删除本地术语草稿，并导出与正式术语库兼容的 UTF-8 BOM CSV
- 右键翻译选中文字
- `Alt + Shift + T` 翻译当前选区
- 点击扩展图标打开浏览器原生侧边栏，在其中粘贴文字翻译
- 右键翻译网页图片
- 配置私有翻译服务地址和访问令牌
- 可关闭的本地最近翻译记录

扩展不会自动读取或翻译整个网页。只有用户明确选择的文字或图片会发送给翻译服务。

选区浮钮和快捷键适用于普通 `http://`、`https://` 页面，也支持文本输入框中的选区。浏览器内部页、扩展商店、PDF 查看器及其他受保护页面禁止内容脚本运行，无法使用这些功能。更新或重新加载未打包扩展后，旧页面若未自动出现浮钮，可刷新该页面；快捷键会在首次使用时尝试补充注入脚本。快捷键可在 `chrome://extensions/shortcuts` 中查看和修改，必须避免与浏览器或其他扩展冲突。

## 本地体验

项目不需要安装 npm 依赖。先启动模拟翻译服务：

```powershell
npm run mock
```

模拟服务运行在 `http://127.0.0.1:8787`，只用于验证扩展交互，不会调用大模型或识别图片。

### Chrome

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择扩展目录 `D:\Codex\ForTranslate\browser-extension`。
5. 点击扩展图标打开网页右侧的常驻翻译侧边栏；在普通网页选择文字后也可点击浮动的“译”。

### Edge

1. 打开 `edge://extensions`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择 `D:\Codex\ForTranslate\browser-extension`。
5. 点击扩展图标打开网页右侧的常驻翻译侧边栏。

浏览器内部页面、扩展商店和部分受保护页面不允许内容脚本运行，属于浏览器限制。

## 后端 API 契约

扩展设置中的服务地址默认是 `http://127.0.0.1:8787`。正式环境建议使用 Tailscale 私有网络或 HTTPS。

### 健康检查

```http
GET /health
Authorization: Bearer <access-token>
```

返回：

```json
{"status":"ok"}
```

### 文本翻译

```http
POST /v1/translate/text
Content-Type: application/json
Authorization: Bearer <access-token>
```

```json
{
  "text": "待翻译原文",
  "context": "",
  "source": "browser_selection"
}
```

### 图片翻译

```http
POST /v1/translate/image
Content-Type: multipart/form-data
Authorization: Bearer <access-token>
```

字段：`image`、`source`。图片上限为 10MB。

### 统一返回结构

```json
{
  "translation": "自然中文译文",
  "notes": [],
  "uncertainties": [],
  "entities": [],
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0
  }
}
```

`notes` 和 `uncertainties` 可以是字符串数组，也可以是包含 `explanation`、`reason` 或 `text` 的对象数组。

## 隐私与权限

扩展需要读取网页内容，才能在任意网站中显示选区翻译按钮；图片右键翻译还需要读取用户明确选择的图片。因此 Manifest 声明了 `<all_urls>`。扩展不执行全文扫描，也不会自动上传页面内容。

访问令牌和所有扩展设置均保存在当前设备的浏览器本地存储中，不进入浏览器同步；大模型 API Key 不应写入扩展，而应仅保存在后端。图片不会写入扩展历史。

## 自检

```powershell
npm run check
```
