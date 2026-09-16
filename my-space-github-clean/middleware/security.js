// ============================================================
// 安全防护中间件 - 多层防御
// ============================================================
// L4-1: Helmet 安全响应头
// L4-2: 速率限制 (登录/全局API)
// L4-3: XSS 输入过滤
// L4-4: 登录暴力破解锁定
// ============================================================

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('../database');

// ========== L4-1: Helmet 安全头 ==========
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

// ========== L4-2: 速率限制器 ==========

// 登录限速: 同IP 15分钟内最多5次尝试
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (req, res) => {
    res.status(429).render('admin/login', {
      title: '登录受限',
      config: { site_name: '管理后台' },
      error_msg: '尝试次数过多，请15分钟后再试'
    });
  },
});

// 全局API限速: 同IP 每分钟最多60次请求
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (req, res) => {
    res.status(429).render('404', {
      title: '请求过于频繁',
      config: {},
      message: '你的请求速度太快了，请稍后再试'
    });
  },
});

// ========== L4-3: XSS 输入过滤 ==========
// 过滤用户输入中的危险内容
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<img[^>]+onerror\s*=/gi, '<img ')
    .replace(/<a[^>]+onclick\s*=/gi, '<a ')
    .trim();
}

// 中间件: 清洗 req.body 中的所有字符串字段
function xssFilterMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    }
  }
  next();
}

// ========== L4-5: CSRF 同源校验 (OWASP 同源检查法) ==========
// 仅对后台 /admin 的状态变更请求做同源校验，与 sameSite:strict 形成双重防护
// 优势：零前端改动、不误伤正常操作；挡住现代浏览器的跨站伪造写请求
function csrfProtection(req, res, next) {
  // 仅作用于后台写操作
  if (!req.path.startsWith('/admin')) return next();
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();

  const origin = req.get('origin');
  const referer = req.get('referer');

  // 受信任来源主机：本站域名 + 本地回环(便于调试)
  const siteUrl = process.env.SITE_URL || 'https://dazyz.art';
  const siteHost = siteUrl.replace(/^https?:\/\//, '').split('/')[0];
  const allowedHosts = new Set([siteHost, '127.0.0.1:3000', 'localhost:3000', 'dazyz.art']);

  const hostOf = (u) => { try { return new URL(u).host; } catch (e) { return null; } };

  // 优先用 Origin 校验（现代浏览器对 HTTPS 站点的跨站/同源请求都会发送）
  if (origin) {
    if (!allowedHosts.has(hostOf(origin))) {
      console.warn('[CSRF] 拒绝非同源 Origin:', origin, 'path:', req.path, 'ip:', req.ip);
      return res.status(403).type('text/html; charset=utf-8').send('<h1>403 Forbidden</h1><p>CSRF 防护：请求来源不被信任，已拒绝。</p>');
    }
    return next();
  }

  // 无 Origin（老旧客户端）：降级用 Referer 校验
  if (referer) {
    const rHost = hostOf(referer);
    if (rHost && !allowedHosts.has(rHost)) {
      console.warn('[CSRF] 拒绝非同源 Referer:', referer, 'path:', req.path, 'ip:', req.ip);
      return res.status(403).type('text/html; charset=utf-8').send('<h1>403 Forbidden</h1><p>CSRF 防护：请求来源不被信任，已拒绝。</p>');
    }
    return next();
  }

  // 既无 Origin 也无 Referer：放行（同源旧客户端可能不发送，依赖 sameSite:strict 兜底）
  return next();
}

// ========== L4-4: 登录暴力破解锁定 ==========
// 初始化数据库表
try {
  db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    username TEXT,
    success INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) {
  // 表已存在
}

// 清理超过30分钟的记录
function cleanupOldAttempts() {
  try {
    db.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-30 minutes')").run();
  } catch (e) {}
}

// 检查IP是否被锁定
function isIPLocked(ip) {
  cleanupOldAttempts();
  const result = db.prepare(
    "SELECT COUNT(*) as count FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > datetime('now', '-15 minutes')"
  ).get(ip);
  return result.count >= 5;
}

// 记录登录尝试
function recordLoginAttempt(ip, username, success) {
  try {
    db.prepare('INSERT INTO login_attempts (ip, username, success) VALUES (?, ?, ?)').run(ip, username, success ? 1 : 0);
    if (success) {
      // 登录成功则清除该IP的失败记录
      db.prepare('DELETE FROM login_attempts WHERE ip = ? AND success = 0').run(ip);
    }
  } catch (e) {}
}

// 获取被锁定IP列表 (给管理后台展示)
function getRecentAttempts(limit = 20) {
  try {
    return db.prepare(
      'SELECT * FROM login_attempts ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  } catch (e) {
    return [];
  }
}

// 获取攻击统计
function getAttackStats() {
  try {
    const failedToday = db.prepare(
      "SELECT COUNT(*) as count FROM login_attempts WHERE success = 0 AND created_at > datetime('now', '-24 hours')"
    ).get().count;
    const lockedIPs = db.prepare(
      "SELECT ip, COUNT(*) as attempts FROM login_attempts WHERE success = 0 AND created_at > datetime('now', '-15 minutes') GROUP BY ip HAVING attempts >= 5"
    ).all();
    const totalBlocked = db.prepare('SELECT COUNT(DISTINCT ip) as count FROM login_attempts WHERE success = 0').get().count;
    return { failedToday, lockedIPs, totalBlocked };
  } catch (e) {
    return { failedToday: 0, lockedIPs: [], totalBlocked: 0 };
  }
}

// 登录锁定中间件
const loginLockout = (req, res, next) => {
  const ip = req.ip;
  if (isIPLocked(ip)) {
    return res.status(429).render('admin/login', {
      title: '登录受限',
      config: { site_name: '管理后台' },
      error_msg: '该IP因多次失败尝试已被暂时锁定，请15分钟后再试'
    });
  }
  next();
};

module.exports = {
  helmetConfig,
  loginLimiter,
  globalLimiter,
  xssFilterMiddleware,
  sanitizeInput,
  loginLockout,
  csrfProtection,
  recordLoginAttempt,
  isIPLocked,
  getRecentAttempts,
  getAttackStats,
};
