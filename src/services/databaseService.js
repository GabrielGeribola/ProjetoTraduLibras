import sequelize from "../config/database";

export async function getAllUsers() {
  const query = "SELECT * FROM users";
  const [rows] = await sequelize.execute(query);
  return rows;
}
