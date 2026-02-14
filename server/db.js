const { Client } = require("pg");
require("dotenv").config();
const client = new Client({
connectionString: process.env.DATABASE_URL,
});
client.connect();
console.log("✅ Connected to Postgres");
async function initDB() {
    try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        snapshot TEXT
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms_user_mapping (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        room_id TEXT NOT NULL
      );
    `);

    console.log("✅ Tables created successfully");
  } catch (err) {
    console.error("❌ Database error:", err);
  } 
}
async function getPassword(username) {
  try {
    const result = await client.query(`
      select password from users where username =$1 
    `,[username]);
    console.log(result.rows)
    if(result.rows.length>0)return result.rows[0].password;
    else return "";
  } catch (err) {
    console.error("❌ Database error:", err);
  } 
}

async function insertUser(username, password) {
  try {
    await client.query(`
      insert into users(username,password) values ($1, $2)
    `,[username,password]);
    console.log("✅ insert user successful");
  } catch (err) {
    console.error("❌ Database error:", err);
  } 
}

module.exports = {
  initDB,
  getPassword,
  insertUser
};
