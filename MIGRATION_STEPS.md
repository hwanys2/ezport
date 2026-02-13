# Railway PostgreSQL 데이터 마이그레이션 단계별 가이드

## ⚠️ 중요: Railway 공개 연결 문자열 필요

Railway의 PostgreSQL은 기본적으로 내부 네트워크(`postgres.railway.internal`)만 제공합니다.
로컬에서 마이그레이션하려면 **공개 연결 문자열**이 필요합니다.

## 1단계: Railway에서 공개 연결 문자열 가져오기

### 방법 A: Railway 대시보드에서

1. Railway 대시보드 접속
2. PostgreSQL 서비스 클릭
3. **"Connect"** 탭 클릭
4. **"Public Network"** 선택
5. 연결 문자열 복사
   - 형식: `postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway`

### 방법 B: Railway CLI 사용 (더 쉬움)

```bash
# Railway CLI 설치
npm i -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
cd /Users/hwanys2/Coding/portpolio
railway link

# PostgreSQL 연결 정보 확인
railway variables
```

## 2단계: 마이그레이션 실행

### 방법 1: 로컬에서 실행 (공개 연결 문자열 필요)

```bash
cd /Users/hwanys2/Coding/portpolio/server

# 공개 연결 문자열 설정
export DATABASE_URL="postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway"

# 마이그레이션 실행
npm run migrate:postgres
```

### 방법 2: Railway CLI로 실행 (권장 - 내부 네트워크 사용 가능)

```bash
cd /Users/hwanys2/Coding/portpolio

# Railway 환경에서 실행 (내부 네트워크 자동 사용)
railway run npm run migrate:postgres
```

**이 방법이 가장 쉽습니다!** Railway CLI가 자동으로 내부 네트워크를 사용하므로 공개 연결 문자열이 필요 없습니다.

## 3단계: 마이그레이션 확인

마이그레이션 완료 후:

1. **Railway 대시보드에서 확인**
   - PostgreSQL 서비스 → Data 탭
   - 각 테이블의 행 수 확인

2. **애플리케이션에서 확인**
   - https://ezport-production.up.railway.app/ 접속
   - 로그인 테스트
   - 포트폴리오 조회 테스트

## 문제 해결

### 오류: `ENOTFOUND postgres.railway.internal`
- **원인**: 로컬에서 Railway 내부 네트워크 접근 불가
- **해결**: Railway CLI 사용 (`railway run`) 또는 공개 연결 문자열 사용

### 오류: `connection refused`
- **원인**: 공개 연결 문자열이 잘못되었거나 PostgreSQL 서비스가 중지됨
- **해결**: Railway 대시보드에서 PostgreSQL 서비스 상태 확인

### 오류: `relation "users" does not exist`
- **원인**: 스키마가 아직 생성되지 않음
- **해결**: 먼저 서버를 한 번 실행하여 스키마 생성

## 빠른 실행 (Railway CLI 사용)

```bash
# 1. Railway CLI 설치 및 로그인
npm i -g @railway/cli
railway login

# 2. 프로젝트 디렉토리로 이동
cd /Users/hwanys2/Coding/portpolio

# 3. 프로젝트 연결
railway link

# 4. 마이그레이션 실행
railway run npm run migrate:postgres
```

이게 가장 간단한 방법입니다! 🚀
