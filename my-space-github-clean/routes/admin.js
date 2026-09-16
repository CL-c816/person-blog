const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const db = require('../database');
const auth = require('../middleware/auth');
const security = require('../middleware/security');

// 图片上传配置
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'public', 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  }
});

// ========== WebP 自动派生 ==========
// 上传原图后生成同名 .webp 副本（保留原图作兜底）。失败仅告警，不影响主流程。
function genWebp(file) {
  if (!file) return;
  const ext = path.extname(file.filename).toLowerCase();
  if (ext === '.webp' || ext === '.svg' || ext === '.gif') return; // 已是 webp/矢量/动图跳过
  const webpPath = path.join(uploadsDir, path.basename(file.filename, ext) + '.webp');
  sharp(file.path).webp({ quality: 82 }).toFile(webpPath, (err) => {
    if (err) console.warn('[webp] 生成失败:', file.filename, err.message);
  });
}

// 登录页面
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { title: '管理员登录', config: { site_name: '管理后台' } });
});

// 登录处理（bcrypt 哈希验证）
router.post('/login', security.loginLockout, security.loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const adminUser = db.prepare("SELECT value FROM config WHERE key = 'admin_username'").get();
  const adminPass = db.prepare("SELECT value FROM config WHERE key = 'admin_password'").get();

  if (username === adminUser.value && bcrypt.compareSync(password, adminPass.value)) {
    security.recordLoginAttempt(req.ip, username, true);
    req.session.isAdmin = true;
    const returnTo = req.session.returnTo || '/admin';
    delete req.session.returnTo;
    return res.redirect(returnTo);
  }
  security.recordLoginAttempt(req.ip, username, false);
  req.flash('error_msg', '账号或密码错误');
  res.redirect('/admin/login');
});

// 登出
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// 管理后台首页（需要登录）
router.get('/', auth, (req, res) => {
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
  const photoCount = db.prepare('SELECT COUNT(*) as count FROM photos').get().count;
  const posts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 5').all();
  const allPhotos = db.prepare('SELECT * FROM photos ORDER BY created_at DESC').all();
  const cfg = {};
  db.prepare('SELECT key, value FROM config').all().forEach(r => { cfg[r.key] = r.value; });
  const links = db.prepare('SELECT * FROM friend_links ORDER BY sort_order ASC').all();
  const allProjects = db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC').all();
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC').all();
  const attackStats = security.getAttackStats();
  const recentAttempts = security.getRecentAttempts(10);

  res.render('admin/dashboard', {
    attackStats,
    recentAttempts,
    title: '管理后台',
    config: { site_name: '管理后台' },
    postCount,
    photoCount,
    posts,
    allPhotos,
    cfg,
    links,
    allProjects,
    announcements
  });
});

// 发布文章页面
router.get('/post/new', auth, (req, res) => {
  res.render('admin/post-form', {
    title: '发布文章',
    config: { site_name: '管理后台' },
    post: null,
    action: '/admin/post'
  });
});

// 编辑文章页面
router.get('/post/:id/edit', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).send('文章不存在');
  res.render('admin/post-form', {
    title: '编辑文章',
    config: { site_name: '管理后台' },
    post,
    action: '/admin/post/' + post.id + '?_method=PUT'
  });
});

// 创建文章
router.post('/post', auth, upload.single('cover'), (req, res) => {
  const { title, content, tags, category, series } = req.body;
  const featured = req.body.featured ? 1 : 0;
  const cover = req.file ? '/uploads/' + req.file.filename : (req.body.cover_url || '');
  genWebp(req.file);

  db.prepare('INSERT INTO posts (title, content, cover, tags, category, series, featured) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(title, content, cover, tags, category || '', series || '', featured);

  req.flash('success_msg', '文章发布成功！');
  res.redirect('/admin');
});

// 更新文章
router.post('/post/:id', auth, upload.single('cover'), (req, res) => {
  const { title, content, tags, category, series } = req.body;
  const featured = req.body.featured ? 1 : 0;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);

  const cover = req.file
    ? '/uploads/' + req.file.filename
    : (req.body.cover_url || post.cover);
  genWebp(req.file);

  db.prepare('UPDATE posts SET title=?, content=?, cover=?, tags=?, category=?, series=?, featured=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(title, content, cover, tags, category || '', series || '', featured, req.params.id);

  req.flash('success_msg', '文章更新成功！');
  res.redirect('/admin');
});

// 删除文章
router.post('/post/:id/delete', auth, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  req.flash('success_msg', '文章已删除');
  res.redirect('/admin');
});

// 上传照片
router.post('/photo/upload', auth, upload.single('photo'), (req, res) => {
  if (!req.file) {
    req.flash('error_msg', '请选择图片文件');
    return res.redirect('/admin');
  }
  const title = req.body.title || '';
  db.prepare('INSERT INTO photos (title, filename) VALUES (?, ?)')
    .run(title, req.file.filename);
  genWebp(req.file);

  req.flash('success_msg', '照片上传成功！');
  res.redirect('/admin#photos');
});

// 删除照片
router.post('/photo/:id/delete', auth, (req, res) => {
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  req.flash('success_msg', '照片已删除');
  res.redirect('/admin#photos');
});

// 站点设置（密码使用 bcrypt 哈希存储）
router.post('/settings', auth, upload.single('avatar'), (req, res) => {
  const { site_name, bio, admin_username, admin_password } = req.body;

  if (req.file) {
    db.prepare("UPDATE config SET value=? WHERE key='about_avatar'").run('/uploads/' + req.file.filename);
  }
  if (site_name) db.prepare("UPDATE config SET value=? WHERE key='site_name'").run(site_name);
  if (bio) db.prepare("UPDATE config SET value=? WHERE key='bio'").run(bio);
  if (admin_username) db.prepare("UPDATE config SET value=? WHERE key='admin_username'").run(admin_username);
  if (admin_password) {
    const hashedPassword = bcrypt.hashSync(admin_password, 10);
    db.prepare("UPDATE config SET value=? WHERE key='admin_password'").run(hashedPassword);
  }
  if (req.body.about_me) db.prepare("UPDATE config SET value=? WHERE key='about_me'").run(req.body.about_me);
  if (req.body.email) db.prepare("UPDATE config SET value=? WHERE key='email'").run(req.body.email);
  if (req.body.github) db.prepare("UPDATE config SET value=? WHERE key='github'").run(req.body.github);
  if (typeof req.body.skills !== 'undefined') db.prepare("UPDATE config SET value=? WHERE key='skills'").run(req.body.skills || '');
  if (typeof req.body.timeline !== 'undefined') {
    var tl = req.body.timeline || '[]';
    try { JSON.parse(tl); } catch(e) { tl = '[]'; }
    db.prepare("UPDATE config SET value=? WHERE key='timeline'").run(tl);
  }
  if (typeof req.body.giscus_repo !== 'undefined') db.prepare("UPDATE config SET value=? WHERE key='giscus_repo'").run(req.body.giscus_repo || '');
  if (typeof req.body.giscus_repo_id !== 'undefined') db.prepare("UPDATE config SET value=? WHERE key='giscus_repo_id'").run(req.body.giscus_repo_id || '');
  if (typeof req.body.giscus_category !== 'undefined') db.prepare("UPDATE config SET value=? WHERE key='giscus_category'").run(req.body.giscus_category || '');
  if (typeof req.body.giscus_category_id !== 'undefined') db.prepare("UPDATE config SET value=? WHERE key='giscus_category_id'").run(req.body.giscus_category_id || '');
  if (typeof req.body.giscus_mapping !== 'undefined') db.prepare("UPDATE config SET value=? WHERE key='giscus_mapping'").run(req.body.giscus_mapping || 'pathname');
  if (typeof req.body.giscus_lang !== 'undefined') db.prepare("UPDATE config SET value=? WHERE key='giscus_lang'").run(req.body.giscus_lang || 'zh-CN');

  req.flash('success_msg', '设置保存成功！');
  res.redirect('/admin#settings');
});

// ========== 友情链接管理 ==========
router.post('/link', auth, (req, res) => {
  const { name, url, description, sort_order } = req.body;
  db.prepare('INSERT INTO friend_links (name, url, description, sort_order) VALUES (?,?,?,?)')
    .run(name, url, description || '', sort_order || 0);
  req.flash('success_msg', '链接添加成功！');
  res.redirect('/admin#links');
});
router.post('/link/:id/delete', auth, (req, res) => {
  db.prepare('DELETE FROM friend_links WHERE id=?').run(req.params.id);
  req.flash('success_msg', '链接已删除');
  res.redirect('/admin#links');
});

// ========== 项目管理 ==========
router.post('/project', auth, upload.single('cover'), (req, res) => {
  const { title, description, content, url, github, tags, featured, sort_order } = req.body;
  const cover = req.file ? '/uploads/' + req.file.filename : (req.body.cover_url || '');
  genWebp(req.file);
  db.prepare('INSERT INTO projects (title, description, content, cover, url, github, tags, featured, sort_order) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(title, description || '', content || '', cover, url || '', github || '', tags || '', featured ? 1 : 0, sort_order || 0);
  req.flash('success_msg', '项目添加成功！');
  res.redirect('/admin#projects');
});
router.post('/project/:id', auth, upload.single('cover'), (req, res) => {
  const { title, description, content, url, github, tags, featured, sort_order } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  const cover = req.file ? '/uploads/' + req.file.filename : (req.body.cover_url || project.cover);
  genWebp(req.file);
  db.prepare('UPDATE projects SET title=?, description=?, content=?, cover=?, url=?, github=?, tags=?, featured=?, sort_order=? WHERE id=?')
    .run(title, description || '', content || '', cover, url || '', github || '', tags || '', featured ? 1 : 0, sort_order || 0, req.params.id);
  req.flash('success_msg', '项目更新成功！');
  res.redirect('/admin#projects');
});
router.post('/project/:id/delete', auth, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  req.flash('success_msg', '项目已删除');
  res.redirect('/admin#projects');
});

// ========== 公告管理 ==========
// 新增公告
router.post('/announcement', auth, (req, res) => {
  const { title, content, pinned } = req.body;
  db.prepare('INSERT INTO announcements (title, content, pinned) VALUES (?, ?, ?)')
    .run(title || '', content || '', pinned ? 1 : 0);
  req.flash('success_msg', '公告已发布！');
  res.redirect('/admin#announcements');
});

// 编辑页
router.get('/announcement/:id/edit', auth, (req, res) => {
  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!ann) return res.status(404).send('公告不存在');
  res.render('admin/announcement-edit', {
    title: '编辑公告',
    config: { site_name: '管理后台' },
    ann
  });
});

// 更新
router.post('/announcement/:id', auth, (req, res) => {
  const { title, content, pinned } = req.body;
  db.prepare('UPDATE announcements SET title=?, content=?, pinned=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(title || '', content || '', pinned ? 1 : 0, req.params.id);
  req.flash('success_msg', '公告已更新！');
  res.redirect('/admin#announcements');
});

// 删除
router.post('/announcement/:id/delete', auth, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  req.flash('success_msg', '公告已删除');
  res.redirect('/admin#announcements');
});

// 置顶切换
router.post('/announcement/:id/pin', auth, (req, res) => {
  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (ann) {
    db.prepare('UPDATE announcements SET pinned = ? WHERE id = ?').run(ann.pinned ? 0 : 1, req.params.id);
  }
  res.redirect('/admin#announcements');
});

module.exports = router;
