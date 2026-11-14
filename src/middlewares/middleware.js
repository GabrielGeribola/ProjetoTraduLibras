exports.middlewareGlobal = (req, res, next) => {
  res.locals.errors= req.flash('errors');
  res.locals.success= req.flash('success');
  res.locals.user = req.session.user;
  // Usado pela navbar para mostrar "Sair" e "Histórico" quando há alguém logado
  res.locals.usuario = req.session.user || null;
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
  if(err) {
     res.render('404')
    console.log(err);
  }

 next();
};

//exports.csrfMiddleware = (req, res, next) => {
//  res.locals.csrfToken = req.csrfToken();
//  next();
//};
