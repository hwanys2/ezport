const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      name_ko TEXT,
      exchange TEXT,
      currency TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      initial_invest_amount REAL DEFAULT 0,
      additional_cash REAL DEFAULT 0,
      is_public INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS portfolio_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      target_weight REAL NOT NULL,
      tolerance REAL DEFAULT 0,
      entry_price REAL NOT NULL,
      initial_quantity REAL NOT NULL,
      current_quantity REAL NOT NULL,
      nickname TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS krx_listings (
      code TEXT PRIMARY KEY,
      name_ko TEXT NOT NULL,
      market TEXT,
      yahoo_suffix TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS latest_prices (
      symbol TEXT PRIMARY KEY,
      price REAL,
      name TEXT,
      exchange TEXT,
      currency TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      query TEXT PRIMARY KEY,
      results TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      currency_pair TEXT PRIMARY KEY,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS us_stock_listings (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      exchange TEXT,
      sector TEXT,
      industry TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // 마이그레이션: is_public 컬럼 추가 (기존 테이블에 없으면 추가)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(portfolios)").all();
    const hasIsPublic = tableInfo.some(col => col.name === 'is_public');
    
    if (!hasIsPublic) {
      console.log('[DB Migration] Adding is_public column to portfolios table...');
      db.exec('ALTER TABLE portfolios ADD COLUMN is_public INTEGER DEFAULT 0');
      console.log('[DB Migration] is_public column added successfully');
    }
  } catch (error) {
    console.warn('[DB Migration] Error checking/adding is_public column:', error?.message);
  }

  // 마이그레이션: hwanys2@naver.com을 hwanys2로 변경
  try {
    const oldUser = db.prepare('SELECT id FROM users WHERE email = ?').get('hwanys2@naver.com');
    const newUser = db.prepare('SELECT id FROM users WHERE email = ?').get('hwanys2');
    
    if (oldUser && !newUser) {
      console.log('[DB Migration] Updating hwanys2@naver.com to hwanys2...');
      db.prepare('UPDATE users SET email = ? WHERE email = ?').run('hwanys2', 'hwanys2@naver.com');
      console.log('[DB Migration] User email updated successfully');
    }
  } catch (error) {
    console.warn('[DB Migration] Error updating user email:', error?.message);
  }
}

module.exports = {
  db,
  initDb,
};
