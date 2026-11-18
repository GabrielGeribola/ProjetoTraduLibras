const Login = require('../models/LoginModel');

// Para onde voltar depois do login (ex.: /historico). Só caminhos internos simples,
// para o parâmetro não ser usado como redirecionamento para outro site.
function destinoSeguro(valor) {
  if (typeof valor !== 'string') return null;
  return /^\/(?![/\\])[A-Za-z0-9\-_/]{0,80}$/.test(valor) ? valor : null;
}

exports.index = (req, res) => {
  if (req.session.user) return res.render('login-logado');
  return res.render('login', { voltar: destinoSeguro(req.query.voltar) || '' });
};

exports.register = async (req, res) => {
  try {
    const login = new Login(req.body);
    await login.register();

    if (login.errors.length > 0) {
      req.flash('errors', login.errors);
      req.session.save(() => res.redirect('/register'));
      return;
    }

    req.flash('success', 'Seu usuário foi criado com sucesso. Faça login para continuar.');
    req.session.save(() => res.redirect('/login'));
  } catch (e) {
    console.log(e);
    res.render('404');
  }
};

exports.login = async (req, res) => {
  const voltar = destinoSeguro(req.body.voltar);

  try {
    const login = new Login(req.body);
    await login.login();

    if (login.errors.length > 0) {
      req.flash('errors', login.errors);
      req.session.save(() => res.redirect(voltar ? `/login?voltar=${encodeURIComponent(voltar)}` : '/login'));
      return;
    }

    // Gera uma sessão nova no login, para não reaproveitar a sessão anônima de antes
    req.session.regenerate((err) => {
      if (err) {
        console.log(err);
        return res.render('404');
      }

      req.session.user = login.User;
      req.flash('success', 'Login realizado com sucesso.');
      // Administrador entra direto na área de administração
      const inicio = login.User.papel === 'admin' ? '/admin' : '/home';
      req.session.save(() => res.redirect(voltar || inicio));
    });
  } catch (e) {
    console.log(e);
    res.render('404');
  }
};

exports.logout = (req, res) => {
  // Só redireciona depois que a sessão foi apagada do banco
  req.session.destroy((err) => {
    if (err) console.log('Erro ao encerrar sessão:', err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};

exports.registerPage = (req, res) => {
  if (req.session.user) return res.render('login-logado');
  return res.render('register');
};
