# PostgreSQL 마이그레이션 가이드

## ✅ 완료된 작업

1. ✅ `pg` 패키지 설치 (package.json)
2. ✅ `db.js` PostgreSQL용으로 재작성
3. ✅ 주요 API 엔드포인트 비동기식으로 변경
   - 인증 API (register, login)
   - 포트폴리오 생성
   - 포트폴리오 목록 조회
   - 초기화 함수들

## ⚠️ 남은 작업

다음 파일들도 비동기식으로 변경이 필요합니다:

### 1. server/index.js (일부 API 엔드포인트)
- `/api/portfolios/public` - 공개 포트폴리오 조회
- `/api/portfolios/:id` - 포트폴리오 상세 조회
- `/api/portfolios/:id` (PUT) - 포트폴리오 수정
- `/api/portfolios/:id` (DELETE) - 포트폴리오 삭제
- `/api/portfolios/:id/refresh` - 포트폴리오 새로고침
- `/api/portfolio-items/:id` (PUT) - 포트폴리오 아이템 수정
- `/api/portfolios/:id/items` (POST) - 포트폴리오 아이템 추가
- `/api/portfolio-items/:id` (DELETE) - 포트폴리오 아이템 삭제
- `/api/queue/add-symbol` - 종목 추가
- `/api/queue/status` - 큐 상태 조회

### 2. server/workers.js
- 모든 워커 함수에서 db 호출을 비동기식으로 변경

### 3. server/search_handler.js
- 검색 관련 db 호출 비동기식으로 변경

### 4. server/krx.js
- KRX 관련 db 호출 비동기식으로 변경

### 5. server/scripts/*.js
- 모든 스크립트 파일들 비동기식으로 변경

## 🔧 변경 패턴

### SQLite → PostgreSQL 변경 예시

**Before (SQLite - 동기식)**:
```javascript
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
const users = db.prepare('SELECT * FROM users').all();
const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
```

**After (PostgreSQL - 비동기식)**:
```javascript
const user = await db.get('SELECT * FROM users WHERE email = $1', email);
const users = await db.all('SELECT * FROM users');
const result = await db.run('INSERT INTO users (email) VALUES ($1) RETURNING id', email);
```

### 트랜잭션 변경

**Before**:
```javascript
const tx = db.transaction(() => {
  const result = insertPortfolio.run(...);
  insertItem.run(...);
  return result.lastInsertRowid;
});
const portfolioId = tx();
```

**After**:
```javascript
const portfolioId = await db.transaction(async (tx) => {
  const result = await tx.run('INSERT INTO portfolios (...) VALUES (...) RETURNING id', ...);
  await tx.run('INSERT INTO portfolio_items (...) VALUES (...)', ...);
  return result.rows[0].id;
});
```

### 파라미터 바인딩 변경

- SQLite: `?` 플레이스홀더
- PostgreSQL: `$1`, `$2`, `$3` ... 플레이스홀더

### RETURNING 절 사용

PostgreSQL에서는 INSERT 후 ID를 얻기 위해 `RETURNING id`를 사용합니다.

## 🚀 테스트 방법

1. 로컬에서 PostgreSQL 실행:
```bash
# Docker로 PostgreSQL 실행
docker run --name postgres-test -e POSTGRES_PASSWORD=test -p 5432:5432 -d postgres

# 환경 변수 설정
export DATABASE_URL=postgresql://postgres:test@localhost:5432/postgres
```

2. 서버 실행:
```bash
cd server
npm install
npm run dev
```

3. API 테스트:
- 회원가입/로그인 테스트
- 포트폴리오 생성 테스트
- 포트폴리오 조회 테스트

## 📝 Railway 배포 시 환경 변수

Railway에서 PostgreSQL 서비스를 추가하면 자동으로 다음 환경 변수가 설정됩니다:
- `DATABASE_URL` 또는 `POSTGRES_URL`
- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`

코드에서는 `DATABASE_URL` 또는 `POSTGRES_URL`을 우선 사용합니다.
