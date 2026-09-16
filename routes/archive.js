const express = require('express');
const router = express.Router();
const db = require('../database');

// 归档时间线：按年月倒序铺开全部文章
router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const posts = db.prepare('SELECT id, title, created_at, views FROM posts ORDER BY created_at DESC').all();
  const map = new Map();
  posts.forEach(p => {
    const d = new Date(p.created_at + 'Z');
    const key = d.getFullYear() * 100 + (d.getMonth() + 1);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: p.id,
      title: p.title,
      views: p.views,
      dateStr: d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
    });
  });
  const archives = [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([k, items]) => ({ ym: Math.floor(k / 100) + '年' + (k % 100) + '月', items }));

  res.render('archive', {
    title: '归档 - ' + (config.site_name || '我的个人空间'),
    config,
    archives,
    total: posts.length
  });
});

module.exports = router;
