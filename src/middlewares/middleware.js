exports.middlewareGlobal = (req, res, next) => {
  res.locals.errors= req.flash('errors');
  res.locals.success= req.flash('success');
  res.locals.user = req.session.user;
  next();
}

exports.outroMiddleware = (req, res, next) => {
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
