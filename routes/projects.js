const express = require('express');
const router = express.Router();
const db = require('../database');

// 项目列表
router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const projects = db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC').all();

  res.render('projects', {
    title: '项目展示 - ' + (config.site_name || '我的个人空间'),
    config,
    projects
  });
});

// 项目详情
router.get('/:id', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).render('404', { title: '项目不存在', config: {} });

  project.tagList = project.tags ? project.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  res.render('project', {
    title: project.title + ' - ' + (config.site_name || '我的个人空间'),
    config,
    project
  });
});

module.exports = router;
