const express = require('express');
const router = express.Router();
const db = require('../database');

// 首页
router.get('/', (req, res) => {
  const config = {};
  const configRows = db.prepare('SELECT key, value FROM config').all();
  configRows.forEach(row => { config[row.key] = row.value; });

  const posts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 6').all();
  const photos = db.prepare('SELECT * FROM photos ORDER BY created_at DESC LIMIT 6').all();
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
  const photoCount = db.prepare('SELECT COUNT(*) as count FROM photos').get().count;
  const friendLinks = db.prepare('SELECT * FROM friend_links ORDER BY sort_order ASC').all();
  const featuredProjects = db.prepare('SELECT * FROM projects WHERE featured=1 ORDER BY sort_order ASC LIMIT 6').all();
  const featuredPosts = db.prepare('SELECT * FROM posts WHERE featured=1 ORDER BY created_at DESC LIMIT 6').all();
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC').all();
  const popularPosts = db.prepare('SELECT id, title, cover, views FROM posts ORDER BY views DESC LIMIT 5').all();
  const totalViews = db.prepare('SELECT COALESCE(SUM(views), 0) as s FROM posts').get().s;
  const categories = db.prepare("SELECT category, COUNT(*) as count FROM posts WHERE category != '' GROUP BY category ORDER BY count DESC, category ASC").all();

  // 提取所有文章标签
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

  res.render('index', {
    title: config.site_name || '我的个人空间',
    config,
    posts,
    photos,
    postCount,
    photoCount,
    friendLinks,
    featuredProjects,
    featuredPosts,
    tags: [...tagSet],
    announcements,
    popularPosts,
    totalViews,
    categories
  });
});

// 相册页
router.get('/album', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const photos = db.prepare('SELECT * FROM photos ORDER BY created_at DESC').all();

  res.render('album', {
    title: '相册 - ' + (config.site_name || '我的个人空间'),
    config,
    photos
  });
});

// 照片详情页
router.get('/album/:id', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);

  if (!photo) {
    return res.status(404).render('404', { title: '照片不存在', config });
  }

  // 获取上一张/下一张
  const prevPhoto = db.prepare('SELECT * FROM photos WHERE id < ? ORDER BY id DESC LIMIT 1').get(photo.id);
  const nextPhoto = db.prepare('SELECT * FROM photos WHERE id > ? ORDER BY id ASC LIMIT 1').get(photo.id);

  res.render('photo', {
    title: (photo.title || '照片') + ' - ' + (config.site_name || '我的个人空间'),
    config,
    photo,
    prevPhoto,
    nextPhoto
  });
});

module.exports = router;
