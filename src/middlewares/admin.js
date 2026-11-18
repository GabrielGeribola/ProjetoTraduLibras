const { umaLinha } = require('../config/consulta');

// Protege /admin. O papel é conferido no banco a cada acesso (não só na sessão), para que
// tirar o papel de administrador ou desativar a conta valha na hora.
// Para quem não é administrador a resposta é 404: a área nem aparece para quem não deve vê-la.
exports.adminRequired = async (req, res, next) => {
  const usuario = req.session.user;
  if (!usuario) {
    req.flash('errors', 'Entre com uma conta de administrador para continuar.');
    const voltar = (req.baseUrl + req.path).replace(/[^A-Za-z0-9\-_/]/g, '').slice(0, 80);
    return req.session.save(() => res.redirect(`/login?voltar=${encodeURIComponent(voltar || '/admin')}`));
  }

  try {
    const conta = await umaLinha(
      'SELECT id, email, papel, ativo FROM Usuarios_testes WHERE id = :id',
      { id: usuario.id },
    );
    if (!conta || conta.papel !== 'admin' || !conta.ativo) {
      return res.status(404).render('404', {
        titulo: 'Página não encontrada',
        mensagem: 'A página que você procura não existe ou mudou de endereço.',
      });
    }
    req.admin = conta;
    res.locals.admin = conta;
    return next();
  } catch (e) {
    return next(e);
  }
};
