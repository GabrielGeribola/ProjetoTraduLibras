exports.middlewareGlobal = (req, res, next) => {
  res.locals.errors= req.flash('errors');
  res.locals.success= req.flash('success');
  // Usado pela navbar ("Sair" e "Histórico") e pela home para saber se há alguém logado
  res.locals.user = req.session.user || null;
  next();
}

exports.outroMiddleware = (req, res, next) => {
  next();
}

// Bloqueia páginas que exigem login (ex.: histórico)
exports.loginRequired = (req, res, next) => {
  if (!req.session.user) {
    req.flash('errors', 'Você precisa fazer login para acessar o histórico.');
    req.session.save(() => res.redirect('/login'));
    return;
  }
  next();
}

exports.checkCsrfError = (err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
      return res.status(403).render('404');
  }

  next(err);
};


//exports.csrfMiddleware = (req, res, next) => {
//  res.locals.csrfToken = req.csrfToken();
//  next();
//};
