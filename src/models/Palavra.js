
/*const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Video = require('./Video');

class Palavra extends Model {}

Palavra.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  palavra: { type: DataTypes.STRING, allowNull: false },
  video_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Video, key: 'id' }
  }
}, {
  sequelize, modelName: 'Palavra', tableName: 'palavras'
});

Palavra.belongsTo(Video, { foreignKey: 'video_id' });
module.exports = Palavra;
*/
