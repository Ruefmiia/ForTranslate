# ForTranslate

以泰语和泰娱内容为重点，支持英语及其他常见语言的自然中文翻译项目。

## 当前版本

| 组件 | 版本 |
|---|---:|
| 浏览器扩展 | 0.5.0 |
| 轻量后端 | 0.3.0 |
| Android App | 0.1.0 |

版本规则与发布流程见 [docs/versioning.md](docs/versioning.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## 项目结构

```text
ForTranslate/
├─ browser-extension/   Chrome / Edge 浏览器扩展
├─ backend/             FastAPI + SQLite 轻量翻译后端
├─ mobile-app/          Flutter Android 客户端
└─ README.md            项目总说明
```

浏览器扩展的安装与使用见 [browser-extension/README.md](browser-extension/README.md)；后端的配置、API 和测试说明见 [backend/README.md](backend/README.md)；Android 安装、设置和构建说明见 [mobile-app/README.md](mobile-app/README.md)。

服务器当前部署状态及后续操作见 [docs/server-deployment-progress.md](docs/server-deployment-progress.md)。
