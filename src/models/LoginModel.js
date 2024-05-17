const { Model, DataTypes,} = require('sequelize');
const validator = require('validator');
const bcryptjs = require('bcryptjs');
const sequelize = require('../config/database');
const User = require('./UserModel');



class Login extends Model {
  constructor(body) {
    super();
    this.body = body;
    this.errors = [];
    this.User = null;
  }

  async login(req, res) {
    this.valida();

    const user = await User.findOne({
      attributes: ['id', 'email', 'password'],
      where: {
        email: this.body.email
      }
    });


    if(this.errors.length > 0) return;
    //this.User = await User.findOne({ where: { email: this.body.email } });




    if(user === null) {
      this.errors.push('Erro: Usuário ou senha incorreta!');
      return;
    }

    if(!bcryptjs.compareSync(this.body.password, user.password)) {
      this.errors.push('Senha inválida');
      this.User = null;
      return;
    }
  }

  async register() {
    this.valida();
    if(this.errors.length > 0) return;
    await this.userExists();
    if(this.errors.length > 0) return;
    if(this.User) return;

    const dados = this.body
    const salt = bcryptjs.genSaltSync();
    this.body.password = bcryptjs.hashSync(this.body.password, salt);



      this.User = await User.create(dados)
      .then(() => {
        console.log('Cadastro do usuario feito com sucesso')
      }).catch(() => {
        console.log("Erro ao criar novo usuário: ", e)
        this.errors.push("Erro ao criar novo usuário.")
    });

  }
    //Valição pra conferir se o usuário já existe
   async userExists() {
    const user = await User.findOne({
      attributes: ['email', 'password'],
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
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: { type: DataTypes.STRING, allowNull: true},
  password: { type: DataTypes.STRING, allowNull: true}
}, {
  sequelize,
  modelName: 'Login',
  tableName: 'Usuarios_teste'
});


//Cria o novo usuário apenas se ele não existir.
(async () => {
  try {
    await sequelize.sync();
    console.log("Modelo sincronizado com o banco de dados.");
  } catch (e) {
  console.error("Erro ao sincronizar o modelo com o banco de dados: ", e);
  }

})();

module.exports = Login;

