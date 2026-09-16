const express = require('express');
const router = express.Router();
const db = require('../database');

// 站点地图
router.get('/', (req, res) => {
  const siteUrl = 'https://dazyz.art';

  // 静态页面
  const pages = [
    { loc: siteUrl + '/', changefreq: 'daily', priority: '1.0' },
    { loc: siteUrl + '/blog', changefreq: 'daily', priority: '0.9' },
    { loc: siteUrl + '/about', changefreq: 'monthly', priority: '0.5' },
    { loc: siteUrl + '/projects', changefreq: 'monthly', priority: '0.5' },
    { loc: siteUrl + '/album', changefreq: 'weekly', priority: '0.4' },
    { loc: siteUrl + '/archive', changefreq: 'weekly', priority: '0.4' },
    { loc: siteUrl + '/tags', changefreq: 'weekly', priority: '0.4' },
    { loc: siteUrl + '/category', changefreq: 'weekly', priority: '0.4' },
    { loc: siteUrl + '/series', changefreq: 'weekly', priority: '0.4' }
  ];

  // 文章页
  const posts = db.prepare('SELECT id FROM posts ORDER BY created_at DESC').all();
  posts.forEach(p => {
    pages.push({ loc: siteUrl + '/blog/' + p.id, changefreq: 'weekly', priority: '0.8' });
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  pages.forEach(u => {
    xml += '  <url>\n';
    xml += `    <loc>${u.loc}</loc>\n`;
    xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
    xml += `    <priority>${u.priority}</priority>\n`;
    xml += '  </url>\n';
  });
  xml += '</urlset>';

  res.type('application/xml');
  res.send(xml);
});

module.exports = router;
