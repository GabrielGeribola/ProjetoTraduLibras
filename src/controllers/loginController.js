
const Login = require('../models/LoginModel');

exports.index = (req, res) => {
  if (req.session.user) return res.render('login-logado');
  return res.render('login');
};

exports.register = async (req, res) => {
  try {
    console.log(req.body);
    const login = new Login(req.body);
    await login.register();

  if(login.errors.length > 0) {
    req.flash('errors', login.errors);
    req.session.save(function() {
      return res.redirect('back');
    });
    return;
  }

  req.flash('success', 'Seu usuário foi criado com sucesso.');
  req.session.save(function() {
    return res.redirect('/home');
    });
  } catch (e) {
    console.log(e);
    res.render('404');
  }

};


exports.login = async (req, res) => {
  try {
    const login = new Login(req.body);
    await login.login();

  if(login.errors.length > 0) {
    req.flash('errors', login.errors);
    req.session.save(function() {
      return res.redirect('back');
    });
    return;
  }

  req.flash('success', 'Login realizado com sucesso.');
  req.session.user = login.User;
  req.session.save(function() {
    return res.redirect('/home');
    });
  } catch (e) {
    console.log(e);
    res.render('404');
  }

};

exports.logout = function (req,res) {
  req.session.destroy();
  res.redirect('/')
}

exports.registerPage = (req, res) => {
  return res.render('register');
};
