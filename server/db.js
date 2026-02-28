const { Client } = require("pg");
const Y = require("yjs");
require("dotenv").config();

// Initialize Postgres Client
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

client.connect()
    .then(() => console.log("✅ Connected to Postgres"))
    .catch(err => console.error("❌ Connection error", err.stack));

// Helper to convert YDoc state to a Buffer for BYTEA storage
const toBuffer = (ydoc) => Buffer.from(Y.encodeStateAsUpdate(ydoc));

/**
 * Initializes the database schema.
 * Sets up users, rooms, and a session mapping table with foreign keys.
 */
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

// --- USER OPERATIONS ---

async function getPassword(username) {
    const res = await client.query("SELECT password FROM users WHERE username = $1", [username]);
    return res.rows.length > 0 ? res.rows[0].password : "";
}

async function insertUser(username, password) {
    // Uses ON CONFLICT to avoid errors if the user already exists
    await client.query(
        "INSERT INTO users (username, password) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING", 
        [username, password]
    );
}

// --- ROOM OPERATIONS ---

async function checkRoom(roomId) {
    const res = await client.query("SELECT 1 FROM rooms WHERE id = $1", [roomId]);
    return res.rows.length > 0;
}

async function getRoomDetails(roomId) {
    const res = await client.query("SELECT ydoc_blob, version FROM rooms WHERE id = $1", [roomId]);
    return res.rows[0];
}

async function insertRoom(roomId, ydoc, version) {
    await client.query(
        "INSERT INTO rooms(id, ydoc_blob, version) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        [roomId, toBuffer(ydoc), version]
    );
}

async function updateRoom(ydoc, version, roomId) {
    // Optimistic concurrency control: only updates if the version matches
    return await client.query(
        "UPDATE rooms SET ydoc_blob = $1, version = version + 1 WHERE id = $2 AND version = $3",
        [toBuffer(ydoc), roomId, version]
    );
}

// --- SESSION & MAPPING OPERATIONS ---

async function getUsernamesInRoom(roomId) {
    // Ordered by last_seen to maintain stable participant lists
    const res = await client.query(
        "SELECT username FROM rooms_user_mapping WHERE room_id = $1 ORDER BY last_seen ASC", 
        [roomId]
    );
    return res.rows.map(row => row.username);
}

async function insertRoomUserMapping(roomId, username) {
    /** * UPSERT: Ensures a user is only in one room at a time.
     * Updates the room_id and timestamp if the username already exists.
     */
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
    // Deletes the room metadata only if no users are mapped to it
    await client.query(`
        DELETE FROM rooms 
        WHERE id = $1 
        AND NOT EXISTS (SELECT 1 FROM rooms_user_mapping WHERE room_id = $1)
    `, [roomId]);
}

module.exports = {
    initDB, 
    getPassword, 
    getUsernamesInRoom, 
    getRoomDetails,
    checkRoom, 
    insertUser, 
    insertRoom, 
    insertRoomUserMapping, 
    updateRoom, 
    deleteRoomUserMapping, 
    cleanupRoomIfEmpty
};