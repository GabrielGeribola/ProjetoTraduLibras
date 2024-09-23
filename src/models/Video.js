const { Model, Datatypes, DataTypes} = require('sequelize');
const sequelize = require('../config/database');

class Video extends Model {}

Video.init({
  id: {type: DataTypes.INTEGER, primaryKey: true, autoIncrement:true},
  url: {type: DataTypes.STRING, allowNull: false}
}, {
  sequelize, modelName: 'Video', tableName: 'videos'
});

module.exports = Video;
