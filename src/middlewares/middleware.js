exports.middlewareGlobal = (req, res, next) => {
  res.locals.errors= req.flash('errors');
  res.locals.success= req.flash('success');
  res.locals.user = req.session.user || null;
  next();
}

exports.outroMiddleware = (req, res, next) => {
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
