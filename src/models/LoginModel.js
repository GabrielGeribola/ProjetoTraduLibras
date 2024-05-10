/*const { Model, DataTypes} = require('sequelize');
const validator = require('validator');
const bcryptjs = require('bcryptjs');
const sequelize = require('../config/database');

class Login extends Model {
  constructor(body) {
    super();
    this.body = body;
    this.errors = [];
    this.user = null;
  }

  async login() {
    this.valida();
    if(this.errors.length > 0) return;
    this.user = await LoginModel.findOne({ email: this.body.email });

    if(!this.user) {
      this.errors.push('Usuário não existe.');
      return;
    }

    if(!bcryptjs.compareSync(this.body.password, this.user.password)) {
      this.error.push('Senha inválida');
      this.user = null;
      return;
    }
  }

  async register() {
    this.valida();
    if(this.errors.length > 0) return;

    await this.userExists();

    if(this.errors.length > 0) return;

    const salt = bcryptjs.genSaltSync();
    this.body.password = bcryptjs.hashSync(this.body.password, salt);


      this.user = await LoginModel.create(this.body);
  }
    //Valição pra conferir se o usuário já existe
   async userExists() {
    this.user = await LoginModel.findOne({ email: this.body.email });
    if (this.user) this.errors.push('Usuário já existe.')

  }

  valida() {
    this.cleanUp();

    // **Validação de campos**
    // O email precisa ser válido
    if(!validator.isEmail(this.body.email)) this.errors.push('E-mail Inválido');
    // A senha precisa ter entre 5 a 15 caracteres
    if(this.body.password.length < 5 || this.body.password.length > 15) {
      this.errors.push('A senha precisa ter entre 5 e 15 caracteres.')
    }
  }

  cleanUp() {
    for(const key in this.body) {
      if (typeof this.body[key] !== 'string') {
        this.body[key] = '';
      }
    }

    this.body = {
      email: this.body.email,
      password: this.body.password
    };
  }
}

Login.init({
  email: { type: DataTypes.STRING, allowNull: false},
  password: { type: DataTypes.STRING, allowNull: false}
}, {
  sequelize,
  modelName: 'Login'
});

module.exports = Login;
*/
