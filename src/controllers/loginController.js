
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

  req.flash('success', 'Seu usuário foi criado com sucesso. Faça login para continuar.');
  req.session.save(function() {
    return res.redirect('/login');
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

  // Gera uma sessão nova no login, para não reaproveitar a sessão anônima de antes
  req.session.regenerate(function(err) {
    if (err) {
      console.log(err);
      return res.render('404');
    }

    req.session.user = login.User;
    req.flash('success', 'Login realizado com sucesso.');
    req.session.save(function() {
      return res.redirect('/home');
    });
  });
  } catch (e) {
    console.log(e);
    res.render('404');
  }

};

exports.logout = function (req,res) {
  // Só redireciona depois que a sessão foi apagada do banco
  req.session.destroy(function (err) {
    if (err) console.log('Erro ao encerrar sessão:', err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
}

exports.registerPage = (req, res) => {
  return res.render('register');
};
