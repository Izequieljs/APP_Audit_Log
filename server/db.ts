import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    is_verified INTEGER DEFAULT 0,
    verification_code TEXT
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS daily_limits (
    date TEXT PRIMARY KEY,
    process_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_mode_limits (
    date TEXT,
    mode TEXT,
    process_count INTEGER DEFAULT 0,
    PRIMARY KEY (date, mode)
  );
`);

// Insert default admin if not exists
const adminExists = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@aerisenergy.com.br');
if (!adminExists) {
  // Password '0r0i7ta' hashed with bcrypt (we'll do it in server.ts to avoid top-level await or sync bcrypt here)
}

export default db;
