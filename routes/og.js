const express = require('express');
const router = express.Router();
const db = require('../database');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const W = 1200, H = 630;

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 把标题按字数折行（CJK 每行的字符数），最多 3 行，超出省略
function wrapTitle(title, maxChars) {
  const lines = [];
  let cur = '';
  for (const ch of String(title)) {
    cur += ch;
    if (cur.length >= maxChars) {
      lines.push(cur);
      cur = '';
      if (lines.length >= 3) break;
    }
  }
  if (cur && lines.length < 3) lines.push(cur);
  if (lines.length === 3 && String(title).length > maxChars * 3) {
    lines[2] = lines[2].slice(0, -1) + '…';
  }
  return lines.slice(0, 3);
}

function textSvg(siteName, title, tagline) {
  const lines = wrapTitle(title, 15);
  const startY = 250;
  const lh = 84;
  const titleEls = lines
    .map((ln, i) => `<text x="80" y="${startY + i * lh}" class="title">${xmlEscape(ln)}</text>`)
    .join('');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .site{font-family:'WenQuanYi Micro Hei','Noto Sans CJK SC',sans-serif;fill:#c7cdf2;font-size:30px;font-weight:600;}
    .title{font-family:'WenQuanYi Micro Hei','Noto Sans CJK SC',sans-serif;fill:#ffffff;font-size:66px;font-weight:700;}
    .tag{font-family:'WenQuanYi Micro Hei','Noto Sans CJK SC',sans-serif;fill:#aab2e6;font-size:26px;}
  </style>
  <text x="80" y="110" class="site">${xmlEscape(siteName)}</text>
  <rect x="80" y="135" width="86" height="5" rx="2.5" fill="#6c7bd6"/>
  ${titleEls}
  <text x="80" y="578" class="tag">${xmlEscape(tagline)}</text>
</svg>`;
}

function bgSvg() {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b4a8f"/>
      <stop offset="55%" stop-color="#26305c"/>
      <stop offset="100%" stop-color="#161a2e"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="1010" cy="120" r="220" fill="#ffffff" opacity="0.05"/>
  <circle cx="1120" cy="540" r="160" fill="#6c7bd6" opacity="0.10"/>
</svg>`;
}

router.get('/:id', async (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).send('Not found');
    const siteRow = db.prepare("SELECT value FROM config WHERE key='site_name'").get();
    const siteName = (siteRow && siteRow.value) || '周珩的小栈';
    const tagline = '博客文章 · dazyz.art';

    const textPng = await sharp(Buffer.from(textSvg(siteName, post.title || '未命名', tagline)))
      .png()
      .toBuffer();

    let base;
    const coverRel = post.cover ? String(post.cover).replace(/^\//, '') : '';
    const coverPath = coverRel ? path.join(__dirname, '..', 'public', coverRel) : null;
    if (coverPath && fs.existsSync(coverPath)) {
      const overlay = await sharp(
        Buffer.from(
          `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0e1c" stop-opacity="0.20"/><stop offset="60%" stop-color="#0b0e1c" stop-opacity="0.55"/><stop offset="100%" stop-color="#0b0e1c" stop-opacity="0.88"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#o)"/></svg>`
        )
      )
        .png()
        .toBuffer();
      base = await sharp(coverPath)
        .resize(W, H, { fit: 'cover' })
        .composite([{ input: overlay }])
        .png()
        .toBuffer();
    } else {
      base = await sharp(Buffer.from(bgSvg()))
        .png()
        .toBuffer();
    }

    const out = await sharp(base)
      .composite([{ input: textPng }])
      .png()
      .toBuffer();

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(out);
  } catch (e) {
    res.status(500).send('OG error: ' + e.message);
  }
});

module.exports = router;
