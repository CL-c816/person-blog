const express = require('express');
const router = express.Router();
const db = require('../database');

// 去除 HTML 标签并截断，作为 RSS 描述兜底
function stripHtmlAndTruncate(html, len) {
  if (!html) return '';
  const text = String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? text.slice(0, len) + '…' : text;
}

// RSS Feed
router.get('/', (req, res) => {
  const config = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { config[r.key] = r.value; });

  const posts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 20').all();

  const siteUrl = 'https://dazyz.art';
  const feedUrl = siteUrl + '/rss.xml';

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
  xml += '<channel>\n';
  xml += `  <title>${escapeXml(config.site_name || '我的个人空间')}</title>\n`;
  xml += `  <link>${siteUrl}</link>\n`;
  xml += `  <description>${escapeXml(config.bio || '')}</description>\n`;
  xml += `  <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>\n`;
  xml += `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;

  posts.forEach(post => {
    xml += '  <item>\n';
    xml += `    <title>${escapeXml(post.title)}</title>\n`;
    xml += `    <link>${siteUrl}/blog/${post.id}</link>\n`;
    xml += `    <description>${escapeXml(post.summary || stripHtmlAndTruncate(post.content, 150))}</description>\n`;
    xml += `    <pubDate>${new Date(post.created_at + 'Z').toUTCString()}</pubDate>\n`;
    xml += `    <guid>${siteUrl}/blog/${post.id}</guid>\n`;
    xml += '  </item>\n';
  });

  xml += '</channel>\n';
  xml += '</rss>';

  res.type('application/xml');
  res.send(xml);
});

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = router;
