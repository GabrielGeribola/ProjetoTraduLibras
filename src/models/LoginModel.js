const validator = require('validator');
const bcryptjs = require('bcryptjs');
const User = require('./UserModel');
const { validarEmail } = require('../services/dominioEmail');



class Login {
  constructor(body = {}) {
    this.body = body;
    this.errors = [];
    this.User = null;
    this.emailPendente = false; // login de conta que ainda não confirmou o e-mail
  }

  async login() {
    this.valida();

     if(this.errors.length > 0) return;

    const user = await User.findOne({
      attributes: ['id', 'email', 'password', 'papel', 'ativo', 'email_pendente'],
      where: {
        email: this.body.email
      }
    });

    //this.User = await User.findOne({ where: { email: this.body.email } });

    if(!user || !bcryptjs.compareSync(this.body.password, user.password) ) {
      this.errors.push("Usuário ou senha incorreta.");
      return;
    }

    if (!user.ativo) {
      this.errors.push('Esta conta está desativada. Fale com a equipe do TraduLibras.');
      return;
    }

    // Só depois da senha certa: assim a mensagem não revela quais e-mails têm cadastro
    if (user.email_pendente) {
      this.emailPendente = true;
      this.errors.push('Confirme seu e-mail antes de entrar: abra o link que enviamos quando você se cadastrou.');
      return;
    }

    // Guarda na sessão só o necessário (nunca a senha). O papel serve para mostrar o menu
    // de administração; as páginas /admin conferem o papel no banco a cada acesso.
    this.User = {
      id: user.id,
      email: user.email,
      papel: user.papel,
    };

    User.update({ ultimo_login: new Date() }, { where: { id: user.id } })
      .catch((e) => console.error('Erro ao registrar o último login:', e.message));
  }

  async register() {
    this.valida();
    if(this.errors.length > 0) return;

    // Domínio: existe, recebe e-mail, não é reservado nem descartável (src/services/dominioEmail.js)
    const dominio = await validarEmail(this.body.email);
    if (!dominio.valido) {
      this.errors.push(dominio.mensagem);
      return;
    }

    await this.userExists();
    if(this.errors.length > 0) return;
    if(this.User) return;

    const salt = bcryptjs.genSaltSync();
    const hashedPassword = bcryptjs.hashSync(this.body.password, salt);

    try {
      // A conta só entra depois de confirmar o e-mail pelo link (confirmacaoController)
      this.User = await User.create({
        email: this.body.email,
        password: hashedPassword,
        email_pendente: true,
    });
    } catch(error) {
        console.log("Erro ao criar novo usuário: ", error);
        this.errors.push("Erro ao criar novo usuário.");
    }
  }

    //Valição pra conferir se o usuário já existe
   async userExists() {
    const user = await User.findOne({
      attributes: [  'email', 'password'],
      where: {
        email: this.body.email
      }
    });


    if (user) this.errors.push('Usuário já existe.')

  }

  valida() {
    this.cleanUp();

    // **Validação de campos**
    // O email precisa ser válido
    if(!validator.isEmail(this.body.email)) this.errors.push('E-mail Inválido');
    // A senha precisa ter entre 5 a 15 caracteres
    if(this.body.password.length < 10 ) {
      this.errors.push('A senha precisa ter no minímo 10 caracteres.')
    }
  }

  cleanUp() {
    const {email, password} = this.body;

    this.body = {
      email: typeof email === 'string' ? email.trim() : '',
      password: typeof password === 'string' ? password : ''
    };
  }
}

module.exports = Login;

