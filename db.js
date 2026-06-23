const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'starrychat.db');
let db = null;

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const buffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, username TEXT NOT NULL, content TEXT NOT NULL, type TEXT DEFAULT \"text\", timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
  save();
  return db;
}

function save() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  }
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = { init, run, get, all };
