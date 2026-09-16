// ============================================================
// 数据库模块 - SQLite
// ============================================================
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// 数据目录
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const fs = require('fs');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'space.db');
const db = new Database(dbPath);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 自动建表
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    content TEXT DEFAULT '',
    cover TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    views INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    filename TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author TEXT NOT NULL DEFAULT '匿名',
    content TEXT NOT NULL,
    approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS photo_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id INTEGER NOT NULL,
    author TEXT NOT NULL DEFAULT '匿名',
    content TEXT NOT NULL,
    approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS friend_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    content TEXT DEFAULT '',
    cover TEXT DEFAULT '',
    url TEXT DEFAULT '',
    github TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    featured INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 初始化默认配置
const initConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
initConfig.run('site_name', '我的个人空间');
initConfig.run('bio', '热爱生活，热爱技术，记录成长的点滴。');
initConfig.run('avatar', '');
initConfig.run('admin_username', 'admin');
// 首次启动必须通过环境变量提供管理员密码，绝不在代码中内置默认密码。
const existingAdminPassword = db.prepare("SELECT value FROM config WHERE key = 'admin_password'").get();
if (!existingAdminPassword) {
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD is required on first startup');
  }
  initConfig.run('admin_password', bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));
}
initConfig.run('about_me', '## 关于我\n\n欢迎来到我的个人空间！这里是我记录生活、分享想法的地方。');
initConfig.run('about_avatar', '');
initConfig.run('email', '');
initConfig.run('github', '');
initConfig.run('social_links', '[]');
initConfig.run('announcement', '欢迎来到我的个人空间～ 🐱 这里会发布一些公告和近期动态。');

// 迁移：给已存在的 posts 表增加 featured 字段
const postColumns = db.prepare('PRAGMA table_info(posts)').all();
if (!postColumns.some(c => c.name === 'featured')) {
  db.exec('ALTER TABLE posts ADD COLUMN featured INTEGER DEFAULT 0');
}

// 迁移：给已存在的 posts 表增加 category 字段（分类体系）
const postColumnsCat = db.prepare('PRAGMA table_info(posts)').all();
if (!postColumnsCat.some(c => c.name === 'category')) {
  db.exec("ALTER TABLE posts ADD COLUMN category TEXT DEFAULT ''");
}

// 公告迁移：旧 config.announcement 单文本 -> announcements 表（仅当表为空时，保留旧数据）
const annCountInit = db.prepare('SELECT COUNT(*) as count FROM announcements').get().count;
const oldAnn = db.prepare("SELECT value FROM config WHERE key='announcement'").get();
if (annCountInit === 0 && oldAnn && oldAnn.value) {
  db.prepare('INSERT INTO announcements (title, content, pinned) VALUES (?, ?, 1)')
    .run('站点公告', oldAnn.value);
}

// 初始化默认文章（仅当表为空时）
const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
if (postCount.count === 0) {
  db.prepare(`
    INSERT INTO posts (title, summary, content, tags, views)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    '欢迎来到我的个人空间',
    '这是我的第一篇博客文章，记录搭建个人空间的历程。',
    `## 你好，世界！\n\n欢迎来到我的个人空间！这里是我记录生活、分享想法的地方。\n\n### 关于这个网站\n\n这个网站使用 **Node.js + Express + SQLite** 搭建，采用服务端渲染的方式。\n\n### 我会分享什么\n\n- **技术笔记**：日常学习中的收获\n- **生活随笔**：旅行、美食、读书\n- **摄影作品**：随手拍下的美好瞬间\n\n希望你能在这里找到感兴趣的内容！`,
    '随笔,公告',
    128
  );
}

module.exports = db;
