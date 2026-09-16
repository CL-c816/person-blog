# 🏠 my-space · 个人博客 / 个人空间站

基于 **Node.js + Express 5 + EJS + SQLite** 的轻量个人网站，单机可跑、依赖极少、自带安全加固。
线上实例：<https://dazyz.art>

---

## ✨ 功能特性

### 内容与展示
- 📝 **博客系统** — Markdown 写作（GFM 表格 / 任务列表 / 代码高亮），草稿与置顶
- 🗂 **分类与系列** — 分类体系、系列合集（按主题串联多篇文章）、标签云
- 📚 **归档** — 按时间线归档全部文章
- 📷 **相册 / 照片墙** — 图片上传，自动生成 WebP 缩略图（`<picture>` 自适应）
- 🖼 **图片灯箱** — 文章内图片点击放大浏览
- 🔍 **文章搜索与分页**

### 分享与 SEO
- 🔗 **OG 分享图自动生成** — 服务端用 sharp 动态合成社交分享卡片
- 📡 **RSS 订阅** + **Sitemap** + **robots.txt**（含 AI 爬虫策略）
- 🧩 **JSON-LD 结构化数据** + Twitter Card
- 💬 **Giscus 评论**（基于 GitHub Discussions，配置驱动，无需改代码）
- 📱 **PWA** — 可安装、离线缓存（Service Worker + manifest）
- 🎨 **响应式设计** — 适配 PC / 移动端

### 管理后台
- 🔐 **登录鉴权** — bcrypt 哈希口令 + Session（SQLite 存储）
- ✍️ 文章 / 相册 / 公告 / 站点设置的可视化管理
- 🎛 **配置全部入库** — 站点名、简介、社交链接、友链、评论配置等，后台填完即生效，无需改代码

### 安全加固（默认开启）
- Helmet 安全响应头 + 严格 CSP
- 全站速率限制、登录接口专项限流
- 输入 XSS 过滤（sanitize-html）
- 密码仅存 bcrypt 哈希；`trust proxy` + `secure` / `httpOnly` / `sameSite` Cookie
- 配套 `scripts/monitor_he.sh`：按来源网段统计异常请求，超阈值自动 UFW 封禁

---

## 🛠 技术栈

| 分类 | 技术 |
|------|------|
| 运行时 | Node.js 22 |
| 框架 | Express 5 |
| 模板引擎 | EJS |
| 数据库 | SQLite（better-sqlite3，WAL 模式） |
| 图片处理 | sharp（WebP 转换）+ qrcode |
| 内容渲染 | marked + highlight.js |
| 安全 | helmet · express-rate-limit · sanitize-html · bcryptjs |
| 进程管理 | PM2（cluster 模式） |
| 反向代理 | Nginx + Let's Encrypt(certbot) |

---

## 🚀 快速开始

### 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 设置必需的会话密钥（不设置无法启动）
export SESSION_SECRET="$(openssl rand -hex 32)"
export ADMIN_PASSWORD="$(openssl rand -base64 24)"
export SITE_URL="http://localhost:3000"

# 3. 启动
npm start
# 打开 http://localhost:3000
```

首次启动会自动创建 `data/` 目录、建表并写入默认配置。管理员账号默认为 `admin`，初始密码必须通过 `ADMIN_PASSWORD` 环境变量提供；登录后请在后台修改。

### 环境变量

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `SESSION_SECRET` | ✅ | — | Session Cookie 签名密钥，用 `openssl rand -hex 32` 生成 |
| `ADMIN_PASSWORD` | 首次启动 ✅ | — | 首次创建数据库时设置的管理员密码；不会写入代码库 |
| `PORT` | | `3000` | 服务监听端口 |
| `SITE_URL` | | `https://dazyz.art` | 对外地址，用于 RSS / Sitemap / OG 图的绝对链接 |
| `DATA_DIR` | | `./data` | SQLite 数据目录（`space.db` 内容库 + `sessions.db` 会话库） |
| `UPLOADS_DIR` | | `./public/uploads` | 上传文件目录 |

参考 `.env.example`。注意：项目未内置 dotenv，请通过 shell、PM2 或 systemd 注入环境变量。

---

## 🌐 部署（Ubuntu + Nginx + PM2）

```bash
# 1. 上传代码
scp -r ./* ubuntu@你的服务器IP:/opt/my-space/

# 2. 安装依赖
cd /opt/my-space && npm install --omit=dev

# 3. 配置环境变量后启动
export SESSION_SECRET="$(openssl rand -hex 32)"
export ADMIN_PASSWORD="$(openssl rand -base64 24)"
pm2 start ecosystem.config.js && pm2 save

# 4. Nginx 反代
sudo cp nginx.conf /etc/nginx/sites-available/my-space
sudo ln -s /etc/nginx/sites-available/my-space /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. HTTPS 证书
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

> ⚠️ Node 服务只监听 `127.0.0.1:3000`，由 Nginx 对外提供 80/443；`.env`、`data/` 已在 `.gitignore` 中排除。
> 也可使用 `setup-server.sh` 一键完成上述 1-4 步。

---

## 📁 目录结构

```
├── app.js                    # 应用入口：中间件装配 / 路由挂载
├── database.js               # SQLite 初始化、建表、默认配置
├── ecosystem.config.js       # PM2 配置（密钥经环境变量注入）
├── nginx.conf                # Nginx 反代配置模板
├── setup-server.sh           # 一键部署脚本
├── backup-db.sh              # 数据库定时备份脚本
├── middleware/
│   ├── auth.js               # 登录态校验
│   ├── security.js           # Helmet / 限流 / XSS 过滤
│   └── sqlite-session-store.js  # 自研 SQLite Session 存储
├── routes/                   # 路由层
│   ├── index.js  blog.js  category.js  series.js  tags.js
│   ├── archive.js  projects.js  about.js
│   ├── admin.js              # 管理后台（含登录）
│   ├── og.js                 # OG 分享图生成
│   ├── rss.js  sitemap.js    # SEO
├── views/                    # EJS 模板（含 partials/ 与 admin/）
├── public/                   # 静态资源：css / js / 图标 / uploads
├── scripts/monitor_he.sh     # 异常来源网段监控 + 自动封禁
└── data/                     # SQLite 数据（运行时自动创建，不提交）
```

---

## 🔒 安全说明

- 所有密钥（`SESSION_SECRET` 等）通过环境变量注入，**代码库中不含任何明文凭证**
- `data/`（含文章内容、配置、管理员密码哈希、会话）已在 `.gitignore` 中排除，请勿提交
- 首次启动必须设置 `ADMIN_PASSWORD`；部署后建议立即在后台修改
- 建议生产环境额外配置：fail2ban（Nginx + SSH jail）、UFW 白名单、Nginx 层拦截扫描特征路径

---

## 📄 License

[MIT](LICENSE) · Copyright (c) 2026 CL-c816

