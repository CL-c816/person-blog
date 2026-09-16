#!/bin/bash
# ============================================================
# my-space 个人网站 - Ubuntu 一键部署脚本
# 使用方法: chmod +x setup-server.sh && sudo ./setup-server.sh
# ============================================================
set -e

APP_NAME="my-space"
APP_DIR="/opt/${APP_NAME}"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  my-space 个人网站部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# ---------- 1. 系统更新 ----------
echo -e "${YELLOW}[1/7] 更新系统包...${NC}"
apt update -y && apt upgrade -y

# ---------- 2. 安装 Node.js 22 (LTS) ----------
echo -e "${YELLOW}[2/7] 安装 Node.js...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
  echo -e "${GREEN}Node.js $(node -v) 安装完成${NC}"
else
  echo -e "${GREEN}Node.js 已安装: $(node -v)${NC}"
fi

# ---------- 3. 安装 Nginx ----------
echo -e "${YELLOW}[3/7] 安装 Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
  apt install -y nginx
  systemctl enable nginx
  systemctl start nginx
  echo -e "${GREEN}Nginx 安装完成${NC}"
else
  echo -e "${GREEN}Nginx 已安装${NC}"
fi

# ---------- 4. 安装 PM2 ----------
echo -e "${YELLOW}[4/7] 安装 PM2 进程管理器...${NC}"
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
  pm2 startup systemd -u root --hp /root
  echo -e "${GREEN}PM2 安装完成${NC}"
else
  echo -e "${GREEN}PM2 已安装${NC}"
fi

# ---------- 5. 部署应用代码 ----------
echo -e "${YELLOW}[5/7] 部署应用代码...${NC}"
mkdir -p "${APP_DIR}"

# 如果你通过 git 上传，可以在这里拉取
# cd "${APP_DIR}" && git clone https://github.com/你的用户名/仓库名.git .

# 如果你通过 scp 上传，代码已在 /opt/my-space 目录

if [ -f "${APP_DIR}/package.json" ]; then
  cd "${APP_DIR}"
  npm install --production
  echo -e "${GREEN}依赖安装完成${NC}"
else
  echo -e "${YELLOW}请先将项目代码放到 ${APP_DIR}，然后重新运行此脚本${NC}"
  echo -e "${YELLOW}提示: scp -r ./my-space/* root@你的服务器IP:/opt/my-space/${NC}"
fi

# ---------- 6. 配置 Nginx ----------
echo -e "${YELLOW}[6/7] 配置 Nginx 反向代理...${NC}"
if [ -f "${APP_DIR}/nginx.conf" ]; then
  cp "${APP_DIR}/nginx.conf" /etc/nginx/sites-available/${APP_NAME}
  ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
  # 删除默认站点
  rm -f /etc/nginx/sites-enabled/default
  # 测试配置
  nginx -t
  systemctl reload nginx
  echo -e "${GREEN}Nginx 配置完成${NC}"
fi

# ---------- 7. 启动应用 ----------
echo -e "${YELLOW}[7/7] 启动应用...${NC}"
cd "${APP_DIR}"
pm2 delete ${APP_NAME} 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  🎉 部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  应用路径: ${APP_DIR}"
echo -e "  管理后台: http://你的IP/admin"
echo -e "  管理账号: admin（初始密码由 ADMIN_PASSWORD 环境变量提供）"
echo -e "  PM2 状态: pm2 status"
echo -e "  PM2 日志: pm2 logs my-space"
echo -e "  ${YELLOW}⚠️  请确认已设置 SESSION_SECRET 和 ADMIN_PASSWORD，并在后台修改密码！${NC}"
echo -e "${GREEN}========================================${NC}"
