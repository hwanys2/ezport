const { Pool } = require('pg');

// PostgreSQL 연결 설정
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// 연결 테스트
pool.on('connect', () => {
  console.log('[DB] PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  process.exit(-1);
});

// SQLite와 호환되는 API 래퍼
const db = {
  // prepare().get() 대체
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development') {
        console.log('[DB Query]', { text, duration, rows: res.rowCount });
      }
      return res;
    } catch (error) {
      console.error('[DB Query Error]', { text, error: error.message });
      throw error;
    }
  },

  // prepare().get() 대체 - 단일 행 반환
  async get(text, ...params) {
    const res = await this.query(text, params);
    return res.rows[0] || null;
  },

  // prepare().all() 대체 - 모든 행 반환
  async all(text, ...params) {
    const res = await this.query(text, params);
    return res.rows;
  },

  // prepare().run() 대체 - 실행만 (결과 필요 없을 때)
  async run(text, ...params) {
    const res = await this.query(text, params);
    // RETURNING 절이 있으면 id 반환, 없으면 rowCount만 반환
    if (text.toUpperCase().includes('RETURNING')) {
      return {
        lastInsertRowid: res.rows[0]?.id || res.rows[0]?.id || null,
        changes: res.rowCount,
        rows: res.rows,
      };
    }
    return {
      lastInsertRowid: null,
      changes: res.rowCount,
    };
  },

  // exec() 대체 - 여러 쿼리 실행
  async exec(sql) {
    const queries = sql.split(';').filter(q => q.trim());
    for (const query of queries) {
      if (query.trim()) {
        await this.query(query.trim());
      }
    }
  },

  // prepare() 대체 - prepared statement 생성 (PostgreSQL은 자동으로 준비됨)
  prepare(sql) {
    return {
      get: (...params) => db.get(sql, ...params),
      all: (...params) => db.all(sql, ...params),
      run: (...params) => db.run(sql, ...params),
    };
  },

  // transaction() 대체
  async transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: (text, params) => client.query(text, params),
        get: async (text, ...params) => {
          const res = await client.query(text, params);
          return res.rows[0] || null;
        },
        all: async (text, ...params) => {
          const res = await client.query(text, params);
          return res.rows;
        },
        run: async (text, ...params) => {
          const res = await client.query(text, params);
          if (text.toUpperCase().includes('RETURNING')) {
            return {
              lastInsertRowid: res.rows[0]?.id || null,
              changes: res.rowCount,
              rows: res.rows,
            };
          }
          return {
            lastInsertRowid: null,
            changes: res.rowCount,
          };
        },
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

async function initDb() {
  // PostgreSQL 스키마 생성
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255),
      name_ko VARCHAR(255),
      exchange VARCHAR(50),
      currency VARCHAR(10),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      initial_invest_amount DOUBLE PRECISION DEFAULT 0,
      additional_cash DOUBLE PRECISION DEFAULT 0,
      is_public BOOLEAN DEFAULT FALSE,
      memo TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS portfolio_items (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      target_weight DOUBLE PRECISION NOT NULL,
      tolerance DOUBLE PRECISION DEFAULT 0,
      entry_price DOUBLE PRECISION NOT NULL,
      initial_quantity DOUBLE PRECISION NOT NULL,
      current_quantity DOUBLE PRECISION NOT NULL,
      nickname VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS krx_listings (
      code VARCHAR(10) PRIMARY KEY,
      name_ko VARCHAR(255) NOT NULL,
      market VARCHAR(50),
      yahoo_suffix VARCHAR(10),
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS latest_prices (
      symbol VARCHAR(50) PRIMARY KEY,
      price DOUBLE PRECISION,
      name VARCHAR(255),
      exchange VARCHAR(50),
      currency VARCHAR(10),
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      query VARCHAR(255) PRIMARY KEY,
      results TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      currency_pair VARCHAR(20) PRIMARY KEY,
      rate DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS index_metrics (
      symbol VARCHAR(50) PRIMARY KEY,
      slug VARCHAR(100),
      label VARCHAR(255),
      short_label VARCHAR(100),
      region VARCHAR(50),
      current_price DOUBLE PRECISION,
      high_3y DOUBLE PRECISION,
      percent_drop DOUBLE PRECISION,
      currency VARCHAR(10),
      exchange VARCHAR(50),
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS us_stock_listings (
      symbol VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      exchange VARCHAR(50),
      sector VARCHAR(100),
      industry VARCHAR(100),
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 인덱스 생성 (성능 최적화)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
    CREATE INDEX IF NOT EXISTS idx_portfolio_items_portfolio_id ON portfolio_items(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_portfolio_items_asset_id ON portfolio_items(asset_id);
    CREATE INDEX IF NOT EXISTS idx_latest_prices_symbol ON latest_prices(symbol);
    CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
  `);

  // 마이그레이션: is_public 컬럼 추가 (기존 테이블에 없으면 추가)
  try {
    const tableInfo = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'portfolios' AND column_name = 'is_public'
    `);
    
    if (tableInfo.rows.length === 0) {
      console.log('[DB Migration] Adding is_public column to portfolios table...');
      await db.query('ALTER TABLE portfolios ADD COLUMN is_public BOOLEAN DEFAULT FALSE');
      console.log('[DB Migration] is_public column added successfully');
    }
  } catch (error) {
    console.warn('[DB Migration] Error checking/adding is_public column:', error?.message);
  }

  // 마이그레이션: memo 컬럼 추가 (기존 테이블에 없으면 추가)
  try {
    const tableInfo = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'portfolios' AND column_name = 'memo'
    `);
    
    if (tableInfo.rows.length === 0) {
      console.log('[DB Migration] Adding memo column to portfolios table...');
      await db.query('ALTER TABLE portfolios ADD COLUMN memo TEXT');
      console.log('[DB Migration] memo column added successfully');
    }
  } catch (error) {
    console.warn('[DB Migration] Error checking/adding memo column:', error?.message);
  }

  // 마이그레이션: hwanys2@naver.com을 hwanys2로 변경
  try {
    const oldUser = await db.get('SELECT id FROM users WHERE email = $1', 'hwanys2@naver.com');
    const newUser = await db.get('SELECT id FROM users WHERE email = $1', 'hwanys2');
    
    if (oldUser && !newUser) {
      console.log('[DB Migration] Updating hwanys2@naver.com to hwanys2...');
      await db.query('UPDATE users SET email = $1 WHERE email = $2', ['hwanys2', 'hwanys2@naver.com']);
      console.log('[DB Migration] User email updated successfully');
    }
  } catch (error) {
    console.warn('[DB Migration] Error updating user email:', error?.message);
  }

  console.log('[DB] Database initialized successfully');
}

module.exports = {
  db,
  initDb,
  pool, // 필요시 직접 접근 가능
};
