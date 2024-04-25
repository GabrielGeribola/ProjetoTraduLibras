exports.middlewareGlobal = (req, res, next) => {
  res.locals.umaVariavelLocal= 'Este é o valor da variável local.';
  next();
}

exports.outroMiddleware = (req, res, next) => {
  next();
}

exports.checkCsrfError = (err, req, res, next) => {
  if(err) {
     console.log(err)
  }

  next();
};

exports.csrfMiddleware = (req, res, next) => {
  res.locals.csrfToken = req.csrfToken()
  next();
}

