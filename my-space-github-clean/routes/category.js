const express = require('express');
const router = express.Router();
const db = require('../database');

// 分类总览：列出所有分类及文章数
router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });
  const categories = db.prepare("SELECT category, COUNT(*) as count FROM posts WHERE category != '' GROUP BY category ORDER BY count DESC, category ASC").all();
  res.render('category', {
    title: '分类 - ' + (config.site_name || '我的个人空间'),
    config,
    categories
  });
});

// 分类列表页：点分类看该分类下所有文章
router.get('/:cat', (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });
  const posts = db.prepare('SELECT * FROM posts WHERE category = ? ORDER BY created_at DESC').all(cat);
  res.render('category-list', {
    title: '分类：' + cat + ' - ' + (config.site_name || '我的个人空间'),
    config,
    category: cat,
    posts
  });
});

module.exports = router;
