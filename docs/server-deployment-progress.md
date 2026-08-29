# ForTranslate 服务器部署进度

更新时间：2026-08-29（Asia/Shanghai）

## 已完成

- Ubuntu 26.04、Python 3.14 独立虚拟环境部署完成。
- 源码位于 `/opt/fortranslate/source`，虚拟环境位于 `/opt/fortranslate/venv`。
- 配置位于 `/etc/fortranslate/backend.env`，SQLite 位于 `/var/lib/fortranslate/fortranslate.db`。
- `fortranslate-backend.service` 已运行，当前监听 `127.0.0.1:18787`。
- Bearer Token、DeepSeek V4 Flash 文本翻译、Token 统计和扩展 PNA 预检均验证成功。
- Nginx、Memos、PostgreSQL 及现有 Node 服务未被修改。
- 图片翻译暂不使用，因为 `deepseek-v4-flash` 不支持图片输入。

## 明日操作一：关闭 DeepSeek 思考模式

本仓库已支持 `FORTRANSLATE_LLM_THINKING=disabled`，会在 Chat Completions 请求中发送：

```json
{"thinking":{"type":"disabled"}}
```

服务器拉取并测试：

```bash
runuser -u fortranslate -- git -C /opt/fortranslate/source pull --ff-only
cd /opt/fortranslate/source
runuser -u fortranslate -- /opt/fortranslate/venv/bin/python -m pytest -q
```

备份配置，并在不显示密钥的情况下增加配置项：

```bash
cp -a /etc/fortranslate/backend.env /etc/fortranslate/backend.env.before-thinking
if grep -q '^FORTRANSLATE_LLM_THINKING=' /etc/fortranslate/backend.env; then
  sed -i 's/^FORTRANSLATE_LLM_THINKING=.*/FORTRANSLATE_LLM_THINKING=disabled/' /etc/fortranslate/backend.env
else
  printf '%s\n' 'FORTRANSLATE_LLM_THINKING=disabled' >> /etc/fortranslate/backend.env
fi
grep '^FORTRANSLATE_LLM_THINKING=' /etc/fortranslate/backend.env
```

仅重启 ForTranslate 并验证：

```bash
systemctl restart fortranslate-backend
systemctl status fortranslate-backend --no-pager
journalctl -u fortranslate-backend -n 20 --no-pager
```

再次翻译同一短句，对比 `/v1/usage` 中的延迟和 `output_tokens`。

## 明日操作二：取消 SSH 隧道，开放专用端口

用户已明确接受公网 IP 暴露及明文 HTTP 风险。计划直接开放 TCP `18787`，不修改 Nginx。

先记录基线并备份服务文件：

```bash
ss -lntp | grep ':18787'
cp -a /etc/systemd/system/fortranslate-backend.service /etc/systemd/system/fortranslate-backend.service.before-public
```

把服务监听地址从本机改为公网接口：

```bash
sed -i 's/--host 127\.0\.0\.1 --port 18787/--host 0.0.0.0 --port 18787/' /etc/systemd/system/fortranslate-backend.service
systemd-analyze verify /etc/systemd/system/fortranslate-backend.service
systemctl daemon-reload
systemctl restart fortranslate-backend
```

验证新服务和现有服务：

```bash
systemctl status fortranslate-backend --no-pager
ss -lntp | grep ':18787'
systemctl is-active nginx memos postgresql@18-main
```

预期监听地址为 `0.0.0.0:18787`，三个现有服务均为 `active`。

在阿里云安全组新增入方向规则：

- 协议：TCP
- 端口：`18787`
- 来源：优先填写使用者公网 IP 的 `/32`；若不限制则使用 `0.0.0.0/0`

扩展服务地址改为：

```text
http://服务器公网IP:18787
```

访问令牌继续填写原 Bearer Token。无需再运行 SSH 隧道。

> 注意：HTTP 不提供传输加密。即使使用者可信，公网链路上的中间节点仍可能看到访问令牌和翻译内容。若以后需要传输加密，应改为 HTTPS 专用端口。

## 回退

恢复仅本机监听：

```bash
cp -a /etc/systemd/system/fortranslate-backend.service.before-public /etc/systemd/system/fortranslate-backend.service
systemctl daemon-reload
systemctl restart fortranslate-backend
ss -lntp | grep ':18787'
```

预期恢复为 `127.0.0.1:18787`，随后删除阿里云安全组的 TCP `18787` 入方向规则。

恢复思考模式配置：

```bash
cp -a /etc/fortranslate/backend.env.before-thinking /etc/fortranslate/backend.env
systemctl restart fortranslate-backend
```
