const validator = require('validator');
const bcryptjs = require('bcryptjs');
const User = require('./UserModel');



class Login {
  constructor(body = {}) {
    this.body = body;
    this.errors = [];
    this.User = null;
  }

  async login() {
    this.valida();

     if(this.errors.length > 0) return;

    const user = await User.findOne({
      attributes: ['id', 'email', 'password'],
      where: {
        email: this.body.email
      }
    });

    //this.User = await User.findOne({ where: { email: this.body.email } });

    if(!user || !bcryptjs.compareSync(this.body.password, user.password) ) {
      this.errors.push("Usuário ou senha incorreta.");
      return;
    }

    // Guarda na sessão só o necessário (nunca a senha)
    this.User = {
      id: user.id,
      email: user.email
    };
  }

  async register() {
    this.valida();
    if(this.errors.length > 0) return;
    await this.userExists();
    if(this.errors.length > 0) return;
    if(this.User) return;

    const salt = bcryptjs.genSaltSync();
    const hashedPassword = bcryptjs.hashSync(this.body.password, salt);

    try {
      this.User = await User.create({
        email: this.body.email,
        password: hashedPassword
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

