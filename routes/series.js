const express = require('express');
const router = express.Router();
const db = require('../database');

// 系列总览：列出所有系列及文章数
router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });
  const series = db.prepare("SELECT series, COUNT(*) as count FROM posts WHERE series != '' GROUP BY series ORDER BY count DESC, series ASC").all();
  res.render('series', {
    title: '系列 - ' + (config.site_name || '我的个人空间'),
    config,
    series
  });
});

// 系列列表页：点系列看该系列下所有文章（按发布时间升序，便于连载阅读）
router.get('/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });
  const posts = db.prepare('SELECT * FROM posts WHERE series = ? ORDER BY created_at ASC').all(name);
  res.render('series-list', {
    title: '系列：' + name + ' - ' + (config.site_name || '我的个人空间'),
    config,
    series: name,
    posts
  });
});

module.exports = router;
