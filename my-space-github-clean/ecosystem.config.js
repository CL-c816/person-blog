module.exports = {
  apps: [{
    name: "my-space",
    script: "app.js",
    instances: 2,
    exec_mode: "cluster",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      // ⚠️ 请勿把真实密钥写进代码库！通过 shell 环境变量或 .env 注入，例如：
      //   export SESSION_SECRET="$(openssl rand -hex 32)"
      //   export ADMIN_PASSWORD="$(openssl rand -base64 24)"
      SESSION_SECRET: process.env.SESSION_SECRET,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      SITE_URL: process.env.SITE_URL || "https://example.com"
    }
  }]
}
