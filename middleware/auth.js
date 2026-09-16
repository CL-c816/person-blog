// 登录验证中间件
module.exports = function auth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/admin/login');
};
