/* eslint-disable no-console */
const { initDb, db } = require('../db');
const { seedQueue } = require('../queue');

async function main() {
  initDb();

  const args = process.argv.slice(2);
  let listings = [];

  if (args[0] === '--symbol' && args[1]) {
    // 특정 심볼만 등록
    const symbol = args[1].toUpperCase();
    listings = [{
      symbol,
      name: symbol,
      exchange: 'US',
    }];
  } else if (args[0] === '--list' && args[1]) {
    const symbols = args[1].split(',').map(s => s.trim().toUpperCase());
    listings = symbols.map(symbol => ({
      symbol,
      name: symbol,
      exchange: 'US',
    }));
  } else {
    // DB에서 목록 읽기
    const limit = parseInt(args[0], 10) || null;
    
    let query = 'SELECT symbol, name, exchange FROM us_stock_listings ORDER BY symbol ASC';
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    
    listings = db.prepare(query).all();
    
    if (listings.length === 0) {
      console.log('[Seed US] No US stock listings found. Run `npm run us:update` first.');
      process.exit(1);
    }
    
    // 한국 주식 형식(.KS, .KQ) 필터링
    const originalCount = listings.length;
    listings = listings.filter(l => {
      const symbol = l.symbol.toUpperCase();
      return !symbol.includes('.KS') && !symbol.includes('.KQ') && !/^\d{6}$/.test(symbol);
    });
    
    if (listings.length < originalCount) {
      console.log(`[Seed US] Filtered out ${originalCount - listings.length} Korean stocks from list`);
    }
  }
  
  if (listings.length === 0) {
    console.log('[Seed US] No symbols to process');
    process.exit(1);
  }
  
  console.log(`[Seed US] Found ${listings.length} US stock symbols`);
  console.log(`[Seed US] Adding to queue with 15-second intervals...`);
  console.log(`[Seed US] Estimated time: ${Math.ceil(listings.length * 15 / 60)} minutes`);
  console.log(`[Seed US] Press Ctrl+C to stop\n`);
  
  // 큐 초기화
  await seedQueue.obliterate({ force: true });
  
  // 큐에 작업 추가
  listings.forEach((listing) => {
    seedQueue.add(
      {
        code: listing.symbol, // US 주식은 code가 심볼
        name_ko: null, // US 주식은 한글 이름 없음
        market: null,
        yahoo_suffix: null, // US 주식은 suffix 없음
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  });

  console.log(`[Seed US] Added ${listings.length} jobs to queue`);
  console.log(`[Seed US] Processing will start automatically...`);
  console.log(`[Seed US] Monitor progress in server logs\n`);

  // 완료 대기
  let completed = 0;
  let failed = 0;

  seedQueue.on('completed', () => {
    completed++;
    if ((completed + failed) % 10 === 0) {
      console.log(`[Seed US] Progress: ${completed} completed, ${failed} failed`);
    }
  });

  seedQueue.on('failed', () => {
    failed++;
  });

  // 모든 작업이 완료될 때까지 대기
  const checkCompletion = setInterval(() => {
    seedQueue.getJobCounts().then((counts) => {
      if (counts.waiting === 0 && counts.active === 0) {
        clearInterval(checkCompletion);
        console.log(`\n[Seed US] All jobs processed: ${completed} completed, ${failed} failed`);
        process.exit(0);
      }
    });
  }, 5000);

  process.on('SIGINT', () => {
    console.log('\n[Seed US] Interrupted. Jobs will continue in background.');
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('[Seed US] Failed:', e?.message || e);
  process.exit(1);
});
