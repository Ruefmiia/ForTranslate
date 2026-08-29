# ForTranslate Android

当前版本：`0.1.0+1`。

## 功能

- 输入或粘贴泰文、英文及其他常见语言，翻译为自然简体中文。
- 保留 Emoji、对话顺序和换行，复制中文译文。
- 默认折叠解释、不确定项和实体信息，并显示 Token 用量。
- 配置服务地址、独立访问令牌和中文译文字号，支持连接测试。
- 访问令牌由 `flutter_secure_storage` 写入 Android 安全存储。

## 安装

本地构建产物位于：

```text
mobile-app/build/app/outputs/flutter-apk/app-release.apk
```

将 APK 发送到 Android 手机，允许该文件来源安装未知应用后点击安装即可。当前 0.1.0 构建使用 Flutter 模板的调试签名，适合可信小范围测试；正式长期分发前应创建并妥善备份专用发布密钥。

首次打开后进入“设置”：

1. 服务地址填写 `http://服务器公网地址:18787`。
2. 填写为该使用者单独创建的访问令牌。
3. 点击“测试连接”，成功后保存。

当前部署显式允许 HTTP。原文、译文和访问令牌均会明文传输，仅应用于已确认可信的小范围环境。

## 本地构建

需要 Flutter 3.44.7、JDK 21 和 Android SDK。Windows 上如果 Pub 缓存和项目位于不同盘符，本项目已经通过 `android/gradle.properties` 关闭 Kotlin 增量编译，避免跨盘缓存路径错误。

```powershell
cd mobile-app
flutter pub get
flutter analyze
flutter test
flutter build apk --release
```

## 后续版本

- 0.2.x：Android 分享菜单与系统“处理文字”入口。
- 0.3.x：本地历史、收藏和术语草稿。
- 1.0.0：专用长期发布签名与稳定分发流程。
