const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  res.render('about', {
    title: '关于我 - ' + (config.site_name || '我的个人空间'),
    config
  });
});

module.exports = router;
