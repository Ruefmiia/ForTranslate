# ForTranslate PWA 部署

本文只适用于 `translate.devilsarchive.cn`。不要修改 `minitalk`、`phound` 或 Nginx 默认站点；`minitalk` 必须继续保留 `listen 80 default_server;`。

## 服务器目录

- 源码：`/opt/fortranslate/source`
- Python 环境：`/opt/fortranslate/venv`
- PWA 静态文件：`/var/www/fortranslate-pwa`
- 后端：`127.0.0.1:18787`
- Nginx 站点：`/etc/nginx/sites-available/fortranslate`

## 更新静态文件

在服务器拉取代码后执行：

```bash
sudo install -d -o root -g www-data -m 0755 /var/www/fortranslate-pwa
sudo rsync -a --delete /opt/fortranslate/source/pwa/ /var/www/fortranslate-pwa/
sudo find /var/www/fortranslate-pwa -type d -exec chmod 0755 {} \;
sudo find /var/www/fortranslate-pwa -type f -exec chmod 0644 {} \;
```

`rsync --delete` 只作用于明确的 PWA 发布目录。执行前应确认目标为 `/var/www/fortranslate-pwa/`。

## Nginx 配置

先备份当前 ForTranslate 站点：

```bash
sudo cp /etc/nginx/sites-available/fortranslate /etc/nginx/sites-available/fortranslate.before-pwa
```

将 `/etc/nginx/sites-available/fortranslate` 中 HTTPS `server` 块的根路径改为静态站点，并只把现有后端路径转发到 FastAPI：

```nginx
server {
    server_name translate.devilsarchive.cn;

    root /var/www/fortranslate-pwa;
    index index.html;

    location = /health {
        proxy_pass http://127.0.0.1:18787/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:18787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 100s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/translate.devilsarchive.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/translate.devilsarchive.cn/privkey.pem;
}

server {
    listen 80;
    listen [::]:80;
    server_name translate.devilsarchive.cn;
    return 301 https://$host$request_uri;
}
```

保持 Certbot 已生成的其他 SSL 配置行不变。应用配置前只执行：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

如果检查失败，不要重载。恢复方式：

```bash
sudo cp /etc/nginx/sites-available/fortranslate.before-pwa /etc/nginx/sites-available/fortranslate
sudo nginx -t && sudo systemctl reload nginx
```

## 验证

```bash
curl -I https://translate.devilsarchive.cn/
curl -I https://translate.devilsarchive.cn/manifest.webmanifest
curl -I https://translate.devilsarchive.cn/sw.js
```

再使用独立访问令牌在 PWA 设置页完成连接测试和一次文字翻译。不要在命令行历史中直接粘贴令牌。
