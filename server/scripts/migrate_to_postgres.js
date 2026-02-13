#!/usr/bin/env node
/**
 * SQLite에서 PostgreSQL로 데이터 마이그레이션 스크립트
 * 
 * 사용법:
 *   DATABASE_URL=postgresql://... node scripts/migrate_to_postgres.js
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// SQLite 데이터베이스 경로
const sqlitePath = path.join(__dirname, '../data.sqlite');

if (!fs.existsSync(sqlitePath)) {
  console.error(`[Migration] SQLite 파일을 찾을 수 없습니다: ${sqlitePath}`);
  process.exit(1);
}

// PostgreSQL 연결 설정
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// SQLite 연결
const sqliteDb = new Database(sqlitePath);

console.log('[Migration] SQLite 데이터베이스 연결 완료');
console.log('[Migration] PostgreSQL 연결 중...');

// 테이블 목록
const tables = [
  'users',
  'assets',
  'portfolios',
  'portfolio_items',
  'krx_listings',
  'latest_prices',
  'search_cache',
  'exchange_rates',
  'index_metrics',
  'us_stock_listings',
];

async function migrateTable(tableName) {
  try {
    console.log(`\n[Migration] ${tableName} 테이블 마이그레이션 시작...`);
    
    // SQLite에서 데이터 읽기
    const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
    console.log(`[Migration] ${tableName}: ${rows.length}개 행 발견`);
    
    if (rows.length === 0) {
      console.log(`[Migration] ${tableName}: 데이터 없음, 건너뜀`);
      return;
    }
    
    // PostgreSQL에 데이터 삽입
    const client = await pgPool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const columnNames = columns.join(', ');
        
        // 테이블별 특별 처리
        if (tableName === 'users') {
          await client.query(
            `INSERT INTO users (id, email, password_hash, created_at) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (id) DO UPDATE SET 
               email = excluded.email, 
               password_hash = excluded.password_hash, 
               created_at = excluded.created_at`,
            [row.id, row.email, row.password_hash, row.created_at]
          );
        } else if (tableName === 'assets') {
          await client.query(
            `INSERT INTO assets (id, symbol, name, name_ko, exchange, currency, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             ON CONFLICT (symbol) DO UPDATE SET 
               name = excluded.name, 
               name_ko = excluded.name_ko, 
               exchange = excluded.exchange, 
               currency = excluded.currency, 
               created_at = excluded.created_at`,
            [row.id, row.symbol, row.name, row.name_ko, row.exchange, row.currency, row.created_at]
          );
        } else if (tableName === 'portfolios') {
          await client.query(
            `INSERT INTO portfolios (id, user_id, name, initial_invest_amount, additional_cash, is_public, memo, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             ON CONFLICT (id) DO UPDATE SET 
               user_id = excluded.user_id, 
               name = excluded.name, 
               initial_invest_amount = excluded.initial_invest_amount, 
               additional_cash = excluded.additional_cash, 
               is_public = excluded.is_public, 
               memo = excluded.memo, 
               created_at = excluded.created_at`,
            [row.id, row.user_id, row.name, row.initial_invest_amount || 0, row.additional_cash || 0, 
             row.is_public ? true : false, row.memo || null, row.created_at]
          );
        } else if (tableName === 'portfolio_items') {
          await client.query(
            `INSERT INTO portfolio_items (id, portfolio_id, asset_id, target_weight, tolerance, entry_price, initial_quantity, current_quantity, nickname, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
             ON CONFLICT (id) DO UPDATE SET 
               portfolio_id = excluded.portfolio_id, 
               asset_id = excluded.asset_id, 
               target_weight = excluded.target_weight, 
               tolerance = excluded.tolerance, 
               entry_price = excluded.entry_price, 
               initial_quantity = excluded.initial_quantity, 
               current_quantity = excluded.current_quantity, 
               nickname = excluded.nickname, 
               created_at = excluded.created_at`,
            [row.id, row.portfolio_id, row.asset_id, row.target_weight, row.tolerance || 0, 
             row.entry_price, row.initial_quantity, row.current_quantity, row.nickname || null, row.created_at]
          );
        } else if (tableName === 'krx_listings') {
          await client.query(
            `INSERT INTO krx_listings (code, name_ko, market, yahoo_suffix, updated_at) 
             VALUES ($1, $2, $3, $4, $5) 
             ON CONFLICT (code) DO UPDATE SET 
               name_ko = excluded.name_ko, 
               market = excluded.market, 
               yahoo_suffix = excluded.yahoo_suffix, 
               updated_at = excluded.updated_at`,
            [row.code, row.name_ko, row.market, row.yahoo_suffix, row.updated_at]
          );
        } else if (tableName === 'latest_prices') {
          await client.query(
            `INSERT INTO latest_prices (symbol, price, name, exchange, currency, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (symbol) DO UPDATE SET 
               price = excluded.price, 
               name = excluded.name, 
               exchange = excluded.exchange, 
               currency = excluded.currency, 
               updated_at = excluded.updated_at`,
            [row.symbol, row.price, row.name, row.exchange, row.currency, row.updated_at]
          );
        } else if (tableName === 'search_cache') {
          await client.query(
            `INSERT INTO search_cache (query, results, updated_at) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (query) DO UPDATE SET 
               results = excluded.results, 
               updated_at = excluded.updated_at`,
            [row.query, row.results, row.updated_at]
          );
        } else if (tableName === 'exchange_rates') {
          await client.query(
            `INSERT INTO exchange_rates (currency_pair, rate, updated_at) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (currency_pair) DO UPDATE SET 
               rate = excluded.rate, 
               updated_at = excluded.updated_at`,
            [row.currency_pair, row.rate, row.updated_at]
          );
        } else if (tableName === 'index_metrics') {
          await client.query(
            `INSERT INTO index_metrics (symbol, slug, label, short_label, region, current_price, high_3y, percent_drop, currency, exchange, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
             ON CONFLICT (symbol) DO UPDATE SET 
               slug = excluded.slug, 
               label = excluded.label, 
               short_label = excluded.short_label, 
               region = excluded.region, 
               current_price = excluded.current_price, 
               high_3y = excluded.high_3y, 
               percent_drop = excluded.percent_drop, 
               currency = excluded.currency, 
               exchange = excluded.exchange, 
               updated_at = excluded.updated_at`,
            [row.symbol, row.slug, row.label, row.short_label, row.region, 
             row.current_price, row.high_3y, row.percent_drop, row.currency, row.exchange, row.updated_at]
          );
        } else if (tableName === 'us_stock_listings') {
          await client.query(
            `INSERT INTO us_stock_listings (symbol, name, exchange, sector, industry, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (symbol) DO UPDATE SET 
               name = excluded.name, 
               exchange = excluded.exchange, 
               sector = excluded.sector, 
               industry = excluded.industry, 
               updated_at = excluded.updated_at`,
            [row.symbol, row.name, row.exchange, row.sector, row.industry, row.updated_at]
          );
        }
      }
      
      await client.query('COMMIT');
      console.log(`[Migration] ✓ ${tableName}: ${rows.length}개 행 마이그레이션 완료`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`[Migration] ✗ ${tableName} 마이그레이션 실패:`, error.message);
    throw error;
  }
}

async function main() {
  try {
    // PostgreSQL 연결 테스트
    await pgPool.query('SELECT NOW()');
    console.log('[Migration] PostgreSQL 연결 성공\n');
    
    // 각 테이블 마이그레이션
    for (const table of tables) {
      try {
        await migrateTable(table);
      } catch (error) {
        console.error(`[Migration] ${table} 테이블 마이그레이션 중 오류:`, error.message);
        // 계속 진행
      }
    }
    
    console.log('\n[Migration] 모든 마이그레이션 완료!');
    
    // 통계 출력
    console.log('\n[Migration] 마이그레이션 통계:');
    for (const table of tables) {
      try {
        const result = await pgPool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  - ${table}: ${result.rows[0].count}개 행`);
      } catch (error) {
        console.log(`  - ${table}: 확인 실패`);
      }
    }
    
  } catch (error) {
    console.error('[Migration] 마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

main();
