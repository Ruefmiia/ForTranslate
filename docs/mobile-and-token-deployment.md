# 移动端上线与独立令牌操作

以下步骤在现有后端 `0.2.x` 正常运行的前提下升级到 `0.3.0`。数据库表通过 `CREATE TABLE IF NOT EXISTS` 增量创建，不会删除现有术语、用量或服务配置。

## 一、服务器升级后端

先检查当前服务并拉取代码：

```bash
systemctl is-active fortranslate-backend nginx memos postgresql@18-main
runuser -u fortranslate -- git -C /opt/fortranslate/source status --short
runuser -u fortranslate -- env GIT_SSH_COMMAND="ssh -i /opt/fortranslate/.ssh/github_deploy -o IdentitiesOnly=yes" git -C /opt/fortranslate/source pull --ff-only
```

更新依赖、运行测试后再重启 ForTranslate；不会操作 nginx、Memos 或 PostgreSQL：

```bash
runuser -u fortranslate -- /opt/fortranslate/venv/bin/pip install -r /opt/fortranslate/source/backend/requirements.txt
cd /opt/fortranslate/source/backend
runuser -u fortranslate -- /opt/fortranslate/venv/bin/python -m pytest
systemctl restart fortranslate-backend
systemctl is-active fortranslate-backend nginx memos postgresql@18-main
journalctl -u fortranslate-backend -n 30 --no-pager
```

## 二、创建每位使用者的独立令牌

环境文件保持现有权限 `root:fortranslate 640`。每执行一次 `create` 只显示一次明文令牌，应立即单独发送给对应使用者：

```bash
runuser -u fortranslate -- bash -c 'set -a; . /etc/fortranslate/backend.env; set +a; /opt/fortranslate/venv/bin/python -m fortranslate_backend.token_cli create "使用者名称"'
```

列出令牌记录不会显示明文：

```bash
runuser -u fortranslate -- bash -c 'set -a; . /etc/fortranslate/backend.env; set +a; /opt/fortranslate/venv/bin/python -m fortranslate_backend.token_cli list'
```

按返回的数字 ID 禁用、启用或永久撤销：

```bash
runuser -u fortranslate -- bash -c 'set -a; . /etc/fortranslate/backend.env; set +a; /opt/fortranslate/venv/bin/python -m fortranslate_backend.token_cli disable 1'
runuser -u fortranslate -- bash -c 'set -a; . /etc/fortranslate/backend.env; set +a; /opt/fortranslate/venv/bin/python -m fortranslate_backend.token_cli enable 1'
runuser -u fortranslate -- bash -c 'set -a; . /etc/fortranslate/backend.env; set +a; /opt/fortranslate/venv/bin/python -m fortranslate_backend.token_cli revoke 1'
```

现有 `FORTRANSLATE_ACCESS_TOKEN` 继续有效，可在所有客户端切换到独立令牌并验证后再决定是否移除。

## 三、手机安装与验证

1. 将 `app-release.apk` 发送到手机并安装。
2. 打开设置，填写 `http://47.116.136.58:18787` 和该使用者的独立令牌。
3. 点击“测试连接”并保存。
4. 分别测试泰文、英文、Emoji 对话和多行文本。

APK 0.1.1 使用调试签名，仅用于当前小范围测试。不要删除或更换构建电脑的调试密钥，否则后续同包名 APK 可能无法覆盖安装；正式发布前改用专用发布密钥。
