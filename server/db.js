const { Client } = require("pg");
const Y = require("yjs");
require("dotenv").config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

client.connect()
    .then(() => console.log("✅ Connected to Postgres"))
    .catch(err => console.error("❌ Connection error", err.stack));

// Helper to convert YDoc to Buffer for Postgres BYTEA
const toBuffer = (ydoc) => Buffer.from(Y.encodeStateAsUpdate(ydoc));

async function initDB() {
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                ydoc_blob BYTEA,
                version INT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS rooms_user_mapping (
                username TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_user FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE,
                CONSTRAINT fk_room FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );
        `);
        console.log("✅ Tables verified/created");
    } catch (err) {
        console.error("❌ Database init error:", err);
    }
}

async function getPassword(username) {
    const res = await client.query("SELECT password FROM users WHERE username = $1", [username]);
    return res.rows.length > 0 ? res.rows[0].password : "";
}

async function getRoomDetails(roomId) {
    const res = await client.query("SELECT * FROM rooms WHERE id = $1", [roomId]);
    return res.rows[0];
}

async function getUsernamesInRoom(roomId) {
    const res = await client.query("SELECT username FROM rooms_user_mapping WHERE room_id = $1", [roomId]);
    return res.rows.map(row => row.username);
}

async function insertUser(username, password) {
    await client.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, password]);
}

async function checkRoom(roomId) {
    const res = await client.query("SELECT 1 FROM rooms WHERE id = $1", [roomId]);
    return res.rows.length > 0;
}

async function insertRoom(roomId, ydoc, version) {
    await client.query(
        "INSERT INTO rooms(id, ydoc_blob, version) VALUES ($1, $2, $3)",
        [roomId, toBuffer(ydoc), version]
    );
}

async function insertRoomUserMapping(roomId, username) {
    // UPSERT: Corrects "Ghost" entries on pod restart
    await client.query(`
        INSERT INTO rooms_user_mapping (room_id, username, last_seen) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (username) DO UPDATE SET room_id = $1, last_seen = NOW()
    `, [roomId, username]);
}

async function deleteRoomUserMapping(username) {
    await client.query("DELETE FROM rooms_user_mapping WHERE username = $1", [username]);
}

async function cleanupRoomIfEmpty(roomId) {
    // Only delete room if NO users are left globally
    await client.query(`
        DELETE FROM rooms 
        WHERE id = $1 
        AND NOT EXISTS (SELECT 1 FROM rooms_user_mapping WHERE room_id = $1)
    `, [roomId]);
}

async function updateRoom(ydoc, version, roomId) {
    await client.query(
        "UPDATE rooms SET ydoc_blob = $1, version = version + 1 WHERE id = $2 AND version = $3",
        [toBuffer(ydoc), roomId, version]
    );
}

module.exports = {
    initDB, getPassword, getUsernamesInRoom, getRoomDetails,
    checkRoom, insertUser, insertRoom, insertRoomUserMapping, 
    updateRoom, deleteRoomUserMapping, cleanupRoomIfEmpty
};