/* eslint-disable no-console */
const { initDb } = require('../db');
const { seedQueue } = require('../queue');
const { hasAnyListings, getAllListings } = require('../krx');

async function main() {
  await initDb();

  if (!(await hasAnyListings())) {
    console.error('[Seed] No KRX listings found. Run `npm run krx:update` first.');
    process.exit(1);
  }

  const limit = parseInt(process.argv[2], 10) || null;
  const listings = await getAllListings(limit);

  if (listings.length === 0) {
    console.log('[Seed] No listings to process');
    process.exit(0);
  }

  console.log(`[Seed] Found ${listings.length} KRX listings`);
  console.log(`[Seed] Adding to queue with 15-second intervals...`);
  console.log(`[Seed] Estimated time: ${Math.ceil(listings.length * 15 / 60)} minutes`);
  console.log(`[Seed] Press Ctrl+C to stop\n`);

  // 큐 초기화 (이전 작업 제거)
  await seedQueue.obliterate({ force: true });

  // 큐에 작업 추가
  listings.forEach((listing) => {
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

  console.log(`[Seed] Added ${listings.length} jobs to queue`);
  console.log(`[Seed] Processing will start automatically...`);
  console.log(`[Seed] Monitor progress in server logs\n`);

  // 완료 대기
  let completed = 0;
  let failed = 0;

  seedQueue.on('completed', () => {
    completed++;
    if ((completed + failed) % 10 === 0) {
      console.log(`[Seed] Progress: ${completed} completed, ${failed} failed`);
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
        console.log(`\n[Seed] All jobs processed: ${completed} completed, ${failed} failed`);
        process.exit(0);
      }
    });
  }, 5000);

  // 프로세스 종료 시 정리
  process.on('SIGINT', () => {
    console.log('\n[Seed] Interrupted. Jobs will continue in background.');
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('[Seed] Failed:', e?.message || e);
  process.exit(1);
});
