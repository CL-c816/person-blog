const express = require('express');
const router = express.Router();
const db = require('../database');
let QRCode = null;
try { QRCode = require('qrcode'); } catch (e) { QRCode = null; }

// 博客列表
router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const tag = req.query.tag || '';
  const search = req.query.search || '';
  const category = req.query.category || '';

  let query = 'SELECT * FROM posts';
  const params = [];
  const conditions = [];

  if (tag) {
    conditions.push('tags LIKE ?');
    params.push(`%${tag}%`);
  }
  if (search) {
    conditions.push('(title LIKE ? OR content LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY created_at DESC';

  const posts = db.prepare(query).all(...params);

  // 获取所有标签
  const allPosts = db.prepare('SELECT tags FROM posts').all();
  const tagSet = new Set();
  allPosts.forEach(p => {
    if (p.tags) {
      p.tags.split(',').forEach(t => {
        const trimmed = t.trim();
        if (trimmed) tagSet.add(trimmed);
      });
    }
  });

  // 热门文章（按阅读量）
  const popularPosts = db.prepare('SELECT id, title, cover, views FROM posts ORDER BY views DESC LIMIT 5').all();

  res.render('blog', {
    title: '博客 - ' + (config.site_name || '我的个人空间'),
    config,
    posts,
    tags: [...tagSet],
    popularPosts,
    currentTag: tag,
    currentSearch: search,
    currentCategory: category
  });
});

// 文章详情
router.get('/:id', async (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);

  if (!post) {
    return res.status(404).render('404', { title: '文章不存在', config });
  }

  // 增加阅读量
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(post.id);
  post.views += 1;

  // 解析标签
  post.tagList = post.tags ? post.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  // 上一篇 / 下一篇（按 id 顺序即发布先后）
  const prevPost = db.prepare('SELECT id, title FROM posts WHERE id < ? ORDER BY id DESC LIMIT 1').get(post.id);
  const nextPost = db.prepare('SELECT id, title FROM posts WHERE id > ? ORDER BY id ASC LIMIT 1').get(post.id);

  // 相关文章：同标签推荐（取前 4 篇）
  let relatedPosts = [];
  if (post.tagList.length > 0) {
    const all = db.prepare('SELECT id, title, cover, created_at, views, tags FROM posts WHERE id != ?').all(post.id);
    relatedPosts = all
      .filter(p => {
        const t = (p.tags || '').split(',').map(x => x.trim()).filter(Boolean);
        return t.some(x => post.tagList.includes(x));
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
  }

  // 文章页二维码（扫码分享，服务端生成 data URL，无需前端第三方库）
  const siteUrl = process.env.SITE_URL || 'https://dazyz.art';
  let qrCode = '';
  if (QRCode) {
    try {
      qrCode = await QRCode.toDataURL(siteUrl + '/blog/' + post.id, { margin: 1, width: 220 });
    } catch (e) { qrCode = ''; }
  }

  res.render('post', {
    title: post.title + ' - ' + (config.site_name || '我的个人空间'),
    config,
    post,
    prevPost,
    nextPost,
    relatedPosts,
    qrCode
  });
});

module.exports = router;
