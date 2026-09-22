# ForTranslate PWA

面向 iOS、鸿蒙、Android 和桌面浏览器的文字翻译客户端。PWA 使用现有 FastAPI 接口，不包含大模型密钥，也不启用图片翻译。

## 功能

- 泰语、英语等内容翻译为自然中文
- 统一的 3,000 字符限制
- 独立访问令牌验证和额度显示
- 最多 20 条本地翻译历史，可关闭或清空
- 安装到主屏幕、离线打开应用外壳
- 为 iOS 快捷翻译签发受限专用凭证；配置官方模板后支持复制凭证并跳转安装
- 浅色/深色主题、键盘操作和屏幕阅读器状态提示

翻译请求和译文不会进入 Service Worker 缓存。访问令牌可保存到当前设备或仅保留在当前浏览会话。

## 本地检查

```powershell
cd pwa
node --check src/app.js
node --check src/api.js
node --check src/storage.js
node --check sw.js
node --test
python -m http.server 4173
```

打开 `http://127.0.0.1:4173`。本地静态服务器不会转发 API；完整联调需要使用反向代理，将 `/health` 和 `/v1/` 转发至后端。

## 图标

图标从 Android App 的品牌母版生成：

```powershell
python tools/generate_icons.py
```

## 部署

部署步骤见 [`../docs/pwa-deployment.md`](../docs/pwa-deployment.md)。配置只修改 `translate.devilsarchive.cn` 自己的站点文件，不应修改 `minitalk`、`phound` 或默认站点。
