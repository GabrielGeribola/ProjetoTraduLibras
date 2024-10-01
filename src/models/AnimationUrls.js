const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

class AnimationUrls extends Model {}

AnimationUrls.init({
  id_animation: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  sequelize,
  modelName: 'AnimationUrls',
  tableName: 'animation_urls',
  timestamps: false,
});

module.exports = AnimationUrls;
