/* eslint-disable no-console */
const { initDb, db } = require('../db');
const { seedQueue } = require('../queue');

async function main() {
  initDb();

  // ETF/ETN 종목만 조회 (market에 ETF 또는 ETN이 포함된 것)
  const listings = db
    .prepare(`
      SELECT code, name_ko, market, yahoo_suffix
      FROM krx_listings
      WHERE market LIKE 'ETF%' OR market LIKE 'ETN%' OR name_ko LIKE '%ETF%' OR name_ko LIKE '%ETN%'
      ORDER BY code ASC
    `)
    .all();

  if (listings.length === 0) {
    console.log('[Seed ETF] No ETF/ETN listings found. Run `npm run etf:update` first.');
    process.exit(1);
  }

  // 이미 assets에 등록된 종목 확인 (중복 방지)
  const existingSymbols = new Set(
    db.prepare('SELECT symbol FROM assets').all().map((r) => r.symbol)
  );

  // 중복 제거: symbol 형식으로 변환하여 확인
  const newListings = listings.filter((listing) => {
    const symbol = listing.yahoo_suffix 
      ? `${listing.code}.${listing.yahoo_suffix}` 
      : `${listing.code}.KS`; // 기본값
    return !existingSymbols.has(symbol);
  });

  if (newListings.length === 0) {
    console.log('[Seed ETF] All ETF/ETN listings are already registered in assets.');
    process.exit(0);
  }

  console.log(`[Seed ETF] Found ${listings.length} ETF/ETN listings`);
  console.log(`[Seed ETF] ${existingSymbols.size} already registered`);
  console.log(`[Seed ETF] ${newListings.length} new listings to process`);
  console.log(`[Seed ETF] Adding to queue with 15-second intervals...`);
  console.log(`[Seed ETF] Estimated time: ${Math.ceil(newListings.length * 15 / 60)} minutes`);
  console.log(`[Seed ETF] Press Ctrl+C to stop\n`);

  // 큐 초기화 (이전 작업 제거)
  await seedQueue.obliterate({ force: true });

  // 큐에 작업 추가
  newListings.forEach((listing) => {
    seedQueue.add(
      {
        code: listing.code,
        name_ko: listing.name_ko,
        market: listing.market,
        yahoo_suffix: listing.yahoo_suffix,
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

  console.log(`[Seed ETF] Added ${newListings.length} jobs to queue`);
  console.log(`[Seed ETF] Processing will start automatically...`);
  console.log(`[Seed ETF] Monitor progress in server logs\n`);

  // 완료 대기
  let completed = 0;
  let failed = 0;

  seedQueue.on('completed', () => {
    completed++;
    if ((completed + failed) % 10 === 0) {
      console.log(`[Seed ETF] Progress: ${completed} completed, ${failed} failed`);
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
        console.log(`\n[Seed ETF] All jobs processed: ${completed} completed, ${failed} failed`);
        process.exit(0);
      }
    });
  }, 5000);

  // 프로세스 종료 시 정리
  process.on('SIGINT', () => {
    console.log('\n[Seed ETF] Interrupted. Jobs will continue in background.');
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('[Seed ETF] Failed:', e?.message || e);
  process.exit(1);
});
