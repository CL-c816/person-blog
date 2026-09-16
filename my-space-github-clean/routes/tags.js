const express = require('express');
const router = express.Router();
const db = require('../database');

// 标签云：统计每个标签的文章数，按频率调整字号
router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const rows = db.prepare('SELECT tags FROM posts').all();
  const count = {};
  rows.forEach(r => {
    (r.tags || '').split(',').forEach(t => {
      const name = t.trim();
      if (name) count[name] = (count[name] || 0) + 1;
    });
  });
  const tagList = Object.keys(count)
    .map(name => ({ name, count: count[name] }))
    .sort((a, b) => b.count - a.count);
  const max = tagList.length ? Math.max(...tagList.map(t => t.count)) : 1;
  const min = tagList.length ? Math.min(...tagList.map(t => t.count)) : 0;
  tagList.forEach(t => {
    const r = max === min ? 0.5 : (t.count - min) / (max - min);
    t.size = (0.85 + r * 0.9).toFixed(2); // 0.85rem ~ 1.75rem
  });

  res.render('tags', {
    title: '标签云 - ' + (config.site_name || '我的个人空间'),
    config,
    tagList
  });
});

// 标签列表页：点标签看该标签下所有文章
router.get('/:tag', (req, res) => {
  const tag = decodeURIComponent(req.params.tag);
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });
  const posts = db.prepare('SELECT * FROM posts WHERE tags LIKE ? ORDER BY created_at DESC').all('%' + tag + '%');
  res.render('tags-list', {
    title: '标签：' + tag + ' - ' + (config.site_name || '我的个人空间'),
    config,
    tag,
    posts
  });
});

module.exports = router;
