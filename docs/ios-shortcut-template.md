# iOS 快捷翻译模板发布

PWA 和后端已经支持“一键准备安装”。苹果要求共享快捷指令先由 iPhone、iPad 或 Mac 上的“快捷指令”App 发布，项目无法在 Windows 或 Linux 服务器上代替 Apple 完成这一步。

## 一次性制作模板

创建名为 `ForTranslation` 的快捷指令，并按以下顺序添加动作：

1. 在快捷指令详情中开启“在共享表单中显示”，接收类型选择“文本”。
2. 添加“获取 URL 内容”：
   - URL：`https://translate.devilsarchive.cn/v1/translate/text`
   - 方法：`POST`
   - 标头：`Authorization` = `Bearer [专用凭证]`
   - 请求正文：`JSON`
   - `text` = “快捷指令输入”
   - `context` = 空文本
   - `source` = `ios-shortcut`
3. 添加“获取字典值”，键为 `translation`。
4. 添加“复制到剪贴板”。
5. 添加“显示结果”。
6. 打开快捷指令的“设置”，为标头中的 `[专用凭证]` 添加导入问题：`请粘贴 ForTranslation 专用凭证`。
7. 测试从 Safari 分享一段文字，确认能得到译文。

## 发布并启用一键安装

1. 在快捷指令编辑器中选择“共享”→“复制 iCloud 链接”。
2. 确认链接格式为 `https://www.icloud.com/shortcuts/...`。
3. 在服务器 `/etc/fortranslate/backend.env` 中加入：

```bash
FORTRANSLATE_IOS_SHORTCUT_URL=https://www.icloud.com/shortcuts/你的链接ID
```

4. 重启后端：

```bash
systemctl restart fortranslate-backend
```

配置生效后，PWA 的按钮会自动从“生成专用凭证”变为“复制凭证并安装”。用户只需点击按钮，在苹果安装页获取快捷指令，并在导入问题中粘贴一次已复制的专用凭证。

## 安全说明

- 模板中不得写入 PWA 的原访问令牌。
- 共享前确认导入问题已经清空模板中的测试凭证。
- 专用凭证只能调用文字翻译；用户可在 PWA 设置中点击“停用全部”。
- 更新模板后可发布新的 iCloud 链接，再替换环境变量，无需重新构建 PWA。