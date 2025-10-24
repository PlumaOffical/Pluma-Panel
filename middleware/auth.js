module.exports = {
  ensureAuth: (req, res, next) => {
    if (req.session && req.session.user) return next();
    return res.redirect('/auth/login');
  },

  ensureGuest: (req, res, next) => {
    if (req.session && req.session.user) return res.redirect('/');
    return next();
  },
};
module.exports = {
  ensureAuth: (req, res, next) => {
    if (req.session && req.session.user) return next();
    return res.redirect('/auth/login');
  },

  ensureGuest: (req, res, next) => {
    if (req.session && req.session.user) return res.redirect('/');
    return next();
  },
};