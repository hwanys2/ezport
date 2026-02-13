# SQLite → PostgreSQL 데이터 마이그레이션 가이드

## 개요

로컬 SQLite 데이터베이스의 데이터를 Railway PostgreSQL 데이터베이스로 마이그레이션하는 방법입니다.

## 사전 준비

1. **로컬에 SQLite 데이터베이스 파일이 있어야 합니다**
   - `server/data.sqlite` 파일 확인

2. **Railway PostgreSQL 연결 정보 확인**
   - Railway 대시보드 → PostgreSQL 서비스 → Variables
   - `DATABASE_URL` 또는 `POSTGRES_URL` 확인

## 마이그레이션 방법

### 방법 1: 로컬에서 실행 (권장)

1. **환경 변수 설정**
   ```bash
   export DATABASE_URL="postgresql://user:password@host:port/database"
   ```
   
   또는 Railway에서 제공하는 연결 문자열을 그대로 사용:
   ```bash
   export DATABASE_URL="postgresql://postgres:password@postgres.railway.internal:5432/railway"
   ```

2. **마이그레이션 스크립트 실행**
   ```bash
   cd server
   node scripts/migrate_to_postgres.js
   ```

3. **결과 확인**
   - 각 테이블의 마이그레이션 상태 확인
   - 마지막에 통계 출력

### 방법 2: Railway CLI 사용

1. **Railway CLI 설치 및 로그인**
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **로컬 SQLite 파일을 Railway로 업로드**
   ```bash
   # Railway에서 PostgreSQL 서비스 선택
   railway link
   
   # 환경 변수 설정
   railway variables set DATABASE_URL=$(railway variables get DATABASE_URL)
   
   # 마이그레이션 실행
   railway run node server/scripts/migrate_to_postgres.js
   ```

### 방법 3: 수동 마이그레이션 (소량 데이터)

데이터가 적다면 Railway PostgreSQL의 웹 콘솔에서 직접 입력할 수 있습니다.

1. Railway 대시보드 → PostgreSQL 서비스 → Data 탭
2. SQL 쿼리 실행

## 마이그레이션되는 테이블

- ✅ `users` - 사용자 정보
- ✅ `assets` - 등록된 종목들
- ✅ `portfolios` - 포트폴리오들
- ✅ `portfolio_items` - 포트폴리오 아이템들
- ✅ `krx_listings` - KRX 종목 리스트
- ✅ `latest_prices` - 가격 캐시
- ✅ `search_cache` - 검색 캐시
- ✅ `exchange_rates` - 환율 정보
- ✅ `index_metrics` - 시장 지수 정보
- ✅ `us_stock_listings` - 미국 주식 리스트

## 주의사항

1. **중복 데이터 처리**
   - `ON CONFLICT` 절을 사용하여 중복 시 업데이트
   - 기존 데이터는 덮어쓰기됨

2. **외래 키 제약조건**
   - `portfolios` → `users` 참조
   - `portfolio_items` → `portfolios`, `assets` 참조
   - 순서대로 마이그레이션됨

3. **데이터 타입 변환**
   - SQLite의 `INTEGER` → PostgreSQL의 `INTEGER`
   - SQLite의 `TEXT` → PostgreSQL의 `VARCHAR` 또는 `TEXT`
   - SQLite의 `REAL` → PostgreSQL의 `DOUBLE PRECISION`
   - SQLite의 `INTEGER` (boolean) → PostgreSQL의 `BOOLEAN`

## 문제 해결

### 연결 실패
```
Error: connect ECONNREFUSED
```
- `DATABASE_URL` 환경 변수 확인
- Railway PostgreSQL 서비스가 실행 중인지 확인

### 테이블이 존재하지 않음
```
relation "users" does not exist
```
- 먼저 서버를 한 번 실행하여 스키마 생성
- 또는 `server/db.js`의 `initDb()` 함수 실행

### 외래 키 제약조건 오류
```
foreign key constraint fails
```
- 테이블 마이그레이션 순서 확인
- 참조되는 테이블이 먼저 마이그레이션되어야 함

## 마이그레이션 후 확인

1. **Railway 대시보드에서 확인**
   - PostgreSQL 서비스 → Data 탭
   - 각 테이블의 행 수 확인

2. **애플리케이션에서 확인**
   - 로그인 테스트
   - 포트폴리오 조회 테스트
   - 종목 검색 테스트

## 롤백

마이그레이션을 되돌리려면:
```sql
-- PostgreSQL에서 모든 데이터 삭제
TRUNCATE TABLE portfolio_items CASCADE;
TRUNCATE TABLE portfolios CASCADE;
TRUNCATE TABLE assets CASCADE;
TRUNCATE TABLE users CASCADE;
-- ... 기타 테이블들
```

주의: 이 작업은 되돌릴 수 없습니다!
