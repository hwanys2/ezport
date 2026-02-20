const { Pool } = require('pg');

// PostgreSQL 연결 설정
// Railway는 여러 환경 변수를 제공할 수 있음
let connectionConfig;

if (process.env.DATABASE_URL) {
  // DATABASE_URL이 있으면 사용
  connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  };
} else if (process.env.POSTGRES_URL) {
  // POSTGRES_URL이 있으면 사용
  connectionConfig = {
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  };
} else if (process.env.PGHOST) {
  // Railway의 개별 환경 변수 사용
  connectionConfig = {
    host: process.env.PGHOST,
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false },
  };
} else {
  // 로컬 개발 환경 (기본값)
  connectionConfig = {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
    ssl: false,
  };
  console.warn('[DB] Using default local PostgreSQL config. Set DATABASE_URL or POSTGRES_URL for production.');
}

console.log('[DB] Connecting to PostgreSQL...', {
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  hasPostgresUrl: !!process.env.POSTGRES_URL,
  hasPghost: !!process.env.PGHOST,
  host: connectionConfig.host || connectionConfig.connectionString?.split('@')[1]?.split('/')[0] || 'from connection string',
});

const pool = new Pool(connectionConfig);

// 연결 풀 설정
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  // 프로덕션에서는 프로세스를 종료하지 않고 재연결 시도
  if (process.env.NODE_ENV === 'production') {
    console.log('[DB] Will retry connection...');
  } else {
    process.exit(-1);
  }
});

// 연결 테스트
pool.on('connect', (client) => {
  console.log('[DB] PostgreSQL connected');
});

// 연결 풀 에러 핸들링은 아래로 이동

// SQLite와 호환되는 API 래퍼
const db = {
  // prepare().get() 대체
  async query(text, params, options = {}) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development') {
        console.log('[DB Query]', { text, duration, rows: res.rowCount });
      }
      return res;
    } catch (error) {
      // duplicate key 오류는 예상된 오류이므로 조용히 처리 (ON CONFLICT 대체용)
      const isDuplicateKey = error.message && (
        error.message.includes('duplicate key') ||
        error.message.includes('unique constraint')
      );
      
      if (!isDuplicateKey || !options.silentDuplicateKey) {
        console.error('[DB Query Error]', { text, error: error.message });
      }
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
  // 연결 테스트
  try {
    await pool.query('SELECT NOW()');
    console.log('[DB] PostgreSQL connection test successful');
  } catch (error) {
    console.error('[DB] PostgreSQL connection failed:', error.message);
    console.error('[DB] Connection config:', {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasPostgresUrl: !!process.env.POSTGRES_URL,
      hasPghost: !!process.env.PGHOST,
    });
    // Railway에서는 PostgreSQL 서비스가 아직 준비되지 않았을 수 있음
    // 재시도 로직은 상위에서 처리
    throw error;
  }

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

  // CRITICAL: 시퀀스 동기화 (마이그레이션 후 필수)
  // 마이그레이션 시 id를 명시적으로 넣었기 때문에 SERIAL 시퀀스가 업데이트되지 않음
  // 시퀀스를 현재 최대 id로 설정하여 중복 키 오류 방지
  try {
    await db.query(`SELECT setval('assets_id_seq', COALESCE((SELECT MAX(id) FROM assets), 1), true);`);
    await db.query(`SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1), true);`);
    await db.query(`SELECT setval('portfolios_id_seq', COALESCE((SELECT MAX(id) FROM portfolios), 1), true);`);
    await db.query(`SELECT setval('portfolio_items_id_seq', COALESCE((SELECT MAX(id) FROM portfolio_items), 1), true);`);
    console.log('[DB] Sequences synchronized successfully');
  } catch (error) {
    console.warn('[DB] Error synchronizing sequences (may not exist yet):', error?.message);
  }

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

  // 마이그레이션: index_metrics.high_3y_date 컬럼 추가 (3년 고가 발생일)
  try {
    const tableInfo = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'index_metrics' AND column_name = 'high_3y_date'
    `);
    if (tableInfo.rows.length === 0) {
      console.log('[DB Migration] Adding high_3y_date column to index_metrics table...');
      await db.query('ALTER TABLE index_metrics ADD COLUMN high_3y_date TIMESTAMP');
      console.log('[DB Migration] high_3y_date column added successfully');
    }
  } catch (error) {
    console.warn('[DB Migration] Error checking/adding high_3y_date column:', error?.message);
  }

  // 마이그레이션: index_metrics.state 컬럼 추가 (주요 지수 현재 위치 1~6, 악화 시 알림용)
  try {
    const tableInfo = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'index_metrics' AND column_name = 'state'
    `);
    if (tableInfo.rows.length === 0) {
      console.log('[DB Migration] Adding state column to index_metrics table...');
      await db.query('ALTER TABLE index_metrics ADD COLUMN state INTEGER');
      console.log('[DB Migration] state column added successfully');
    }
  } catch (error) {
    console.warn('[DB Migration] Error checking/adding state column:', error?.message);
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
