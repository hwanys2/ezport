/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { initDb, db } = require('../db');
const { upsertListings } = require('../krx');

// CSV 파싱 함수 (따옴표 처리)
function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      if (inQuotes && line[j + 1] === '"') {
        // 이스케이프된 따옴표
        current += '"';
        j++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim()); // 마지막 셀
  return cells;
}

// CSV 파싱 함수
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.replace(/^"|"$/g, '').trim());
  
  console.log('[ETF Update] CSV Headers:', headers.slice(0, 5).join(', '), '...');
  
  const idxCode = headers.findIndex(h => h === '단축코드' || h.includes('단축코드'));
  const idxShortName = headers.findIndex(h => h === '한글종목약명');
  const idxName = headers.findIndex(h => h === '한글종목명');
  
  console.log('[ETF Update] Column indices - Code:', idxCode, 'Short Name:', idxShortName, 'Full Name:', idxName);
  
  if (idxCode < 0) {
    throw new Error('단축코드 column not found in CSV. Headers: ' + headers.join(', '));
  }
  
  // 한글종목약명을 우선 사용, 없으면 한글종목명 사용
  const nameIdx = idxShortName >= 0 ? idxShortName : idxName;
  if (nameIdx < 0) {
    throw new Error('한글종목약명 or 한글종목명 column not found in CSV. Headers: ' + headers.join(', '));
  }
  
  const rows = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cells = parseCSVLine(line);
    
    if (cells.length <= Math.max(idxCode, nameIdx)) {
      skipped++;
      continue;
    }
    
    const code = String(cells[idxCode] || '').replace(/^"|"$/g, '').trim().padStart(6, '0');
    const name_ko = String(cells[nameIdx] || '').replace(/^"|"$/g, '').trim();
    
    if (!code || !name_ko) {
      skipped++;
      continue;
    }
    
    // 코드가 6자리 숫자인지 확인
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      rows.push({ code, name_ko });
    } else {
      skipped++;
      if (skipped <= 5) {
        console.log(`[ETF Update] Skipped row ${i}: code="${code}", name="${name_ko.substring(0, 20)}"`);
      }
    }
  }
  
  if (skipped > 0) {
    console.log(`[ETF Update] Skipped ${skipped} invalid rows`);
  }
  
  return rows;
}

async function main() {
  await initDb();

  // CSV 파일 경로 (명령줄 인자 또는 기본값)
  const csvPath = process.argv[2] || path.join(__dirname, '../../Downloads/data_2404_20260123.csv');
  
  console.log('[ETF Update] Reading ETF list from CSV file...');
  console.log('[ETF Update] File:', csvPath);
  
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  
  // 인코딩 시도: UTF-8, EUC-KR 순서로
  let csvText;
  try {
    csvText = fs.readFileSync(csvPath, 'utf-8');
    // UTF-8로 읽었는데 한글이 깨지면 EUC-KR로 시도
    if (csvText.includes('') || !csvText.includes('단축코드')) {
      const iconv = require('iconv-lite');
      const buf = fs.readFileSync(csvPath);
      csvText = iconv.decode(buf, 'euc-kr');
    }
  } catch (e) {
    // UTF-8 실패 시 EUC-KR 시도
    const iconv = require('iconv-lite');
    const buf = fs.readFileSync(csvPath);
    csvText = iconv.decode(buf, 'euc-kr');
  }
  const rows = parseCSV(csvText);
  
  if (rows.length === 0) {
    throw new Error('No valid ETF listings found in CSV');
  }
  
  console.log(`[ETF Update] Parsed ${rows.length} ETF listings from CSV`);
  
  // ETF/ETN 구분
  const listings = rows.map((r) => {
    const upper = r.name_ko.toUpperCase();
    let market = 'ETF';
    
    // ETN 판별
    if (upper.includes('ETN') || upper.includes('EXCHANGE TRADED NOTE')) {
      market = 'ETN';
    } else {
      market = 'ETF';
    }
    
    return {
      code: r.code,
      name_ko: r.name_ko,
      market,
    };
  });
  
  console.log(`[ETF Update] ETF: ${listings.filter(l => l.market === 'ETF').length}`);
  console.log(`[ETF Update] ETN: ${listings.filter(l => l.market === 'ETN').length}`);

  // 기존 krx_listings에 있는 모든 코드 확인 (중복 방지)
  const existingRows = await db.all('SELECT code FROM krx_listings');
  const existingCodes = new Set(existingRows.map((r) => r.code));

  // 새로 추가할 것과 업데이트할 것 구분
  const newListings = listings.filter((l) => !existingCodes.has(l.code));
  
  // 기존에 있지만 market이 ETF/ETN이 아닌 것들도 업데이트
  const updateListings = [];
  for (const l of listings) {
    if (!existingCodes.has(l.code)) continue;
    const existing = await db.get('SELECT market FROM krx_listings WHERE code = $1', l.code);
    if (existing && existing.market !== 'ETF' && existing.market !== 'ETN') {
      updateListings.push(l);
    }
  }

  // 모든 ETF/ETN을 upsert (기존 것도 name_ko와 market 업데이트)
  await upsertListings(listings);
  
  console.log(`[ETF Update] Processed ${listings.length} ETF/ETN listings`);
  console.log(`[ETF Update] - New: ${newListings.length}`);
  console.log(`[ETF Update] - Updated: ${updateListings.length + (listings.length - newListings.length - updateListings.length)} (including name_ko updates)`);
  console.log(`[ETF Update] - Already ETF/ETN: ${listings.length - newListings.length - updateListings.length}`);
  
  console.log(`[ETF Update] Total ETF/ETN listings in DB: ${listings.length}`);
  console.log(`[ETF Update] ETF: ${listings.filter(l => l.market === 'ETF').length}`);
  console.log(`[ETF Update] ETN: ${listings.filter(l => l.market === 'ETN').length}`);
}

main().catch((e) => {
  console.error('[ETF Update] Failed:', e?.message || e);
  process.exit(1);
});
