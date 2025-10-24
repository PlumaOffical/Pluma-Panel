module.exports = {
  ensureAuth: (req, res, next) => {
    if (req.session && req.session.user) return next();
    return res.redirect('/auth/login');
  },

  ensureGuest: (req, res, next) => {
    if (req.session && req.session.user) return res.redirect('/');
    return next();
  },

  ensureAdmin: (req, res, next) => {
    if (req.session && req.session.user && Number(req.session.user.is_admin) === 1) return next();
    return res.redirect('/');
  },
};