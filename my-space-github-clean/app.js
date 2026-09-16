// ============================================================
// 个人空间 - 主服务器入口 (安全加固版)
// ============================================================
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('./middleware/sqlite-session-store');
const flash = require('connect-flash');
const path = require('path');
const { marked } = require('marked');

// Markdown 渲染配置：GFM(表格/任务列表/删除线) + 换行转<br>(符合中文写作习惯)
marked.setOptions({ gfm: true, breaks: true });

// 安全中间件
const security = require('./middleware/security');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

// ========== L4-1: Helmet 安全头 ==========
app.use(security.helmetConfig);

// ========== L4-2: 全局速率限制 ==========
app.use(security.globalLimiter);

// ========== 中间件配置 ==========
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ========== L4-3: XSS 输入过滤 ==========
app.use(security.xssFilterMiddleware);

app.use(express.static(path.join(__dirname, 'public')));

// 动态页面禁止强缓存：确保每次访问都重新验证，避免浏览器缓存旧 HTML/JS 导致交互异常
app.use((req, res, next) => {
  const ext = path.extname(req.path);
  if (!ext) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// 上传文件目录
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'public', 'uploads');
app.use('/uploads', express.static(uploadsDir));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ dbPath: path.join(__dirname, 'data', 'sessions.db') }),
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: true,
    sameSite: 'strict',
    httpOnly: true }
}));

app.use(flash());

// 全局变量 - 所有模板可用
app.use((req, res, next) => {
  res.locals.isAdmin = req.session.isAdmin || false;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.currentPath = req.path;
  res.locals.siteUrl = process.env.SITE_URL || 'https://dazyz.art';

  // Markdown 渲染辅助函数（使用 marked 库，完整支持标题/列表/引用/表格/代码块/图片/链接等）
  res.locals.renderMarkdown = function(text) {
    if (!text) return '';
    try {
      let html = marked.parse(String(text));
      // 给 h2/h3 加 id 锚点（供 TOC 目录跳转），slug 基于标题文本
      var slugCount = {};
      html = html.replace(/<h([23])>(.*?)<\/h[23]>/g, function(match, level, content) {
        var textContent = content.replace(/<[^>]+>/g, '').trim();
        var base = textContent.toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'section';
        var slug = base;
        if (slugCount[base] !== undefined) {
          slugCount[base]++;
          slug = base + '-' + slugCount[base];
        } else {
          slugCount[base] = 0;
        }
        return '<h' + level + ' id="' + slug + '">' + content + '</h' + level + '>';
      });
      // 让代码块套用 code-theme.css 的 .code-block 浅色主题(含语言标签/复制按钮/highlight.js高亮)
      html = html.replace(/<pre><code class="language-([\w-]+)">/g, '<pre class="code-block" data-lang="$1"><code class="language-$1">');
      html = html.replace(/<pre><code>/g, '<pre class="code-block"><code>');
      // 正文图片懒加载（封面图在模板单独渲染，不在此处，故安全）
      html = html.replace(/<img /g, '<img loading="lazy" ');
      return html;
    } catch (e) {
      return '<p>' + String(text).replace(/</g, '&lt;') + '</p>';
    }
  };

  // 公告是否「新」发布（3 天内），用于 NEW 角标
  res.locals.isNewAnnouncement = function(createdAt) {
    if (!createdAt) return false;
    const t = new Date(String(createdAt).replace(' ', 'T') + 'Z').getTime();
    if (isNaN(t)) return false;
    const diff = Date.now() - t;
    return diff >= 0 && diff < 3 * 24 * 3600 * 1000;
  };

  // 文章摘要助手：去除 Markdown 标记，压缩空白，截断到指定长度
  // 用于列表卡片导语、分享卡片描述(og/twitter)、JSON-LD description
  res.locals.excerpt = function(text, len) {
    len = len || 80;
    if (!text) return '';
    var plain = String(text)
      .replace(/```[\s\S]*?```/g, ' ')        // 围栏代码块
      .replace(/`[^`]*`/g, ' ')                // 行内代码
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // 图片
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
      .replace(/[#>*_~`|]/g, ' ')             // 标记符号 + 表格管道
      .replace(/-{3,}/g, ' ')                 // Markdown 表格分隔行 ---
      .replace(/[\r\n\t]+/g, ' ')             // 换行/制表符
      .replace(/[ ]{2,}/g, ' ')               // 连续空格压缩
      .trim();
    if (plain.length > len) plain = plain.slice(0, len) + '…';
    return plain;
  };

  // WebP 派生助手：给定原图路径，返回同源 .webp 路径，供 <picture> 的 <source> 使用。
  // 外链(http)、data-uri、已是 webp / 矢量(svg) / 动图(gif) 一律原样返回，确保不破坏展示。
  // 原图始终保留作兜底：浏览器优先取 webp，缺失时自动回退到原图 <img>。
  res.locals.webpOf = function(src) {
    if (!src || typeof src !== 'string') return src || '';
    if (src.indexOf('http') === 0 || src.indexOf('data:') === 0) return src;
    var base = src.split('?')[0];
    if (base.indexOf('/') === -1) base = '/uploads/' + base; // 裸文件名补前缀
    if (/\.(webp|svg|gif)$/i.test(base)) return base;        // 已是 webp/矢量/动图，不派生
    return base.replace(/\.[^.]+$/i, '.webp');               // 替换扩展名为 .webp
  };

  // 生成文章页 JSON-LD 结构化数据（Article 类型，JSON.stringify 安全转义）
  res.locals.jsonLdArticle = function(post, config, siteUrl) {
    if (!post) return '';
    var data = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title || '',
      datePublished: (post.created_at ? new Date(post.created_at + 'Z').toISOString() : ''),
      dateModified: (post.created_at ? new Date(post.created_at + 'Z').toISOString() : ''),
      author: { '@type': 'Person', name: (config && config.site_name) || '周珩' },
      publisher: { '@type': 'Organization', name: (config && config.site_name) || '周珩的小栈' },
      description: res.locals.excerpt(post.content, 160),
      mainEntityOfPage: { '@type': 'WebPage', '@id': siteUrl + '/blog/' + post.id }
    };
    if (post.cover) {
      data.image = (post.cover.indexOf('http') === 0 ? post.cover : siteUrl + post.cover);
    }
    return '<script type="application/ld+json">' + JSON.stringify(data) + '</script>';
  };

  next();
});

// ========== 路由 ==========
const indexRoutes = require('./routes/index');
const blogRoutes = require('./routes/blog');
const adminRoutes = require('./routes/admin');
const aboutRoutes = require('./routes/about');
const projectsRoutes = require('./routes/projects');
const rssRoutes = require('./routes/rss');
const sitemapRoutes = require('./routes/sitemap');
const archiveRoutes = require('./routes/archive');
const tagsRoutes = require('./routes/tags');
const categoryRoutes = require('./routes/category');
const seriesRoutes = require('./routes/series');
const ogRoutes = require('./routes/og');

app.use('/', indexRoutes);
app.use('/blog', blogRoutes);
app.use('/admin', adminRoutes);
app.use('/about', aboutRoutes);
app.use('/projects', projectsRoutes);
app.use('/rss.xml', rssRoutes);
app.use('/sitemap.xml', sitemapRoutes);
app.use('/archive', archiveRoutes);
app.use('/tags', tagsRoutes);
app.use('/category', categoryRoutes);
app.use('/series', seriesRoutes);
app.use('/og', ogRoutes);

// /search 别名：重定向到博客搜索（博客页已支持 ?search=）
app.get('/search', (req, res) => {
  const q = req.query.q || req.query.search || '';
  res.redirect('/blog?search=' + encodeURIComponent(q));
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: '页面不存在', config: {} });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.message);
  res.status(500).render('404', { title: '服务器错误', config: {}, message: '服务器开小差了，请稍后再试' });
});

// ========== 启动 ==========
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n[SHIELD] 安全防护已激活`);
  console.log(`  L1 UFW      - 防火墙 (80/443/52022)`);
  console.log(`  L2 Fail2Ban  - SSH + Nginx 入侵检测`);
  console.log(`  L3 Nginx     - 限流 + TLS 1.2+ + Bot拦截`);
  console.log(`  L4 Express   - Helmet + 限速 + XSS过滤 + 登录锁定`);
  console.log(`\n  个人空间已启动: http://localhost:${PORT}`);
});
