const { Model, DataTypes} = require('sequelize');
const validator = require('validator');
const sequelize = require('./database');

class Login extends Model {
  constructor(body) {
    super();
    this.body = body;
    this.errors = [];
    this.user = null;
  }

  async register() {
    this.valida();
    if(this.errors.length > 0) return;

    try {
    this.user = await LoginModel.create(this.body);
    } catch(e) {
      console.log(e);
    }
  }

  valida() {
    this.cleanUp();

    // Validação de campos
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
