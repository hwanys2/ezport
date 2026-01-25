# 사용 가이드

## 🚀 빠른 시작

### 1. Redis 시작
```bash
redis-server
```

### 2. KRX 종목 리스트 업데이트
```bash
npm run krx:update
```
- KRX에서 최신 한국 주식 종목 리스트를 다운로드합니다
- 약 2,700개의 종목이 `krx_listings` 테이블에 저장됩니다

### 3. 초기 데이터 시딩 (선택)
```bash
# 옵션 1: 상위 100개 종목만 등록 (추천, 약 25분 소요)
npm run seed:100

# 옵션 2: 전체 종목 등록 (약 12시간 소요)
npm run seed
```

**중요**: 
- 이 과정은 Yahoo Finance rate limit을 피하기 위해 15초 간격으로 진행됩니다
- 백그라운드에서 실행하고 다른 작업을 하셔도 됩니다
- Ctrl+C로 중단 가능하며, 다시 실행하면 이어서 진행됩니다 (이미 등록된 종목은 업데이트됨)

### 4. 서버 시작
```bash
npm run dev
```

## 📊 시스템 동작 방식

### 검색
1. 사용자가 종목 검색 (예: "삼성", "AAPL")
2. `assets` + `krx_listings` 테이블 검색 (Yahoo API 호출 없음)
3. 즉시 결과 반환

**검색 가능한 항목**:
- 한글 이름 (예: "삼성전자")
- 종목 코드 (예: "005930")
- 티커 (예: "AAPL")
- 영문 이름 (예: "Apple")

### 포트폴리오 생성
1. 검색으로 찾은 종목만 추가 가능
2. DB에 등록된 종목만 사용 가능 (DB에 없으면 에러)
3. 캐시된 가격으로 즉시 생성

### 가격 업데이트
1. 포트폴리오 조회 시 캐시된 가격으로 즉시 응답
2. 1시간 이상 오래된 가격은 백그라운드 큐에 추가
3. 10초 간격으로 하나씩 Yahoo Finance에서 업데이트
4. 사용자는 "새로고침" 버튼으로 업데이트된 가격 확인

## 🔧 데이터베이스 관리

### 현재 상태 확인
```bash
# KRX 종목 개수
sqlite3 data.sqlite "SELECT COUNT(*) FROM krx_listings"

# Assets 개수 (등록된 종목)
sqlite3 data.sqlite "SELECT COUNT(*) FROM assets"

# 가격 캐시 개수
sqlite3 data.sqlite "SELECT COUNT(*) FROM latest_prices"
```

### 특정 종목 추가
만약 DB에 없는 종목을 추가하고 싶다면:

```javascript
// Node.js REPL에서 실행
const { db } = require('./db');
const yahooFinance = require('yahoo-finance2').default;

// 종목 조회
const quote = await yahooFinance.quote('AAPL');

// assets에 추가
db.prepare(`
  INSERT INTO assets (symbol, name, name_ko, exchange, currency, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('AAPL', 'Apple Inc.', '애플', 'NASDAQ', 'USD', new Date().toISOString());

// 가격 캐시 추가
db.prepare(`
  INSERT INTO latest_prices (symbol, price, name, exchange, currency, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('AAPL', quote.regularMarketPrice, 'Apple Inc.', 'NASDAQ', 'USD', new Date().toISOString());
```

### 가격 캐시 초기화
```bash
sqlite3 data.sqlite "DELETE FROM latest_prices"
```
- 다음 포트폴리오 조회 시 백그라운드로 업데이트됩니다

## 🐛 문제 해결

### "종목이 DB에 없습니다" 에러
**원인**: 해당 종목이 `assets` 테이블에 등록되지 않음

**해결**:
1. `npm run seed:100` 실행 (상위 100개 등록)
2. 또는 특정 종목만 수동 추가 (위 "특정 종목 추가" 참조)

### "가격 정보가 없습니다" 에러
**원인**: `latest_prices` 테이블에 가격 캐시가 없음

**해결**:
1. 잠시 대기 (백그라운드로 업데이트 중일 수 있음)
2. 또는 특정 종목 가격만 수동 추가

### Redis 연결 실패
**원인**: Redis 서버가 실행 중이지 않음

**해결**:
```bash
# Redis 시작
redis-server

# 또는 백그라운드로 시작
redis-server --daemonize yes
```

### Yahoo Finance Rate Limit
**증상**: 콘솔에 "Too Many Requests" 또는 "429" 에러

**해결**:
- 자동으로 백그라운드 큐가 처리 중입니다
- 10초 간격으로 하나씩 처리되므로 잠시 대기
- 급한 경우 캐시된 가격 사용

## 📈 성능 최적화

### 캐시 시간 조정
`index.js`의 `PRICE_CACHE_HOURS` 값 변경:

```javascript
const PRICE_CACHE_HOURS = 1; // 1시간 (기본값)
// const PRICE_CACHE_HOURS = 4; // 4시간 (더 적은 API 호출)
```

### 큐 간격 조정
`queue.js`에서 간격 변경:

```javascript
// 가격 업데이트 큐 (기본: 10초)
limiter: {
  max: 1,
  duration: 10000, // 10초
}

// 초기화 큐 (기본: 15초)
limiter: {
  max: 1,
  duration: 15000, // 15초
}
```

## 🔍 모니터링

### Bull Dashboard (옵션)
Bull Dashboard를 설치하여 큐 상태를 모니터링할 수 있습니다:

```bash
npm install bull-board
```

`index.js`에 추가:
```javascript
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(priceUpdateQueue),
    new BullAdapter(seedQueue),
  ],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
```

그 후 `http://localhost:4000/admin/queues`에서 큐 상태 확인 가능합니다.

## 📝 로그

서버를 실행하면 다음과 같은 로그를 볼 수 있습니다:

```
[Worker] Price update worker started
[Worker] Seed worker started
Server listening on 4000
[Queue] Added 5 symbols to update queue
[Price Worker] Updating AAPL...
[Price Worker] ✓ AAPL updated: 150.25
[Queue] Completed: AAPL
```

## 🎯 권장 워크플로우

### 초기 설정 (한 번만)
1. Redis 시작
2. `npm run krx:update`
3. `npm run seed:100` (백그라운드로 실행)
4. 서버 시작

### 일상적인 사용
1. Redis 시작 (자동 시작 설정 권장)
2. 서버 시작
3. 프론트엔드 시작
4. 정상 사용

### 정기 유지보수 (선택)
- 주 1회: `npm run krx:update` (새 상장 종목 업데이트)
- 월 1회: 가격 캐시 초기화 또는 `npm run seed` 재실행
