# 빠른 마이그레이션 가이드

## ⚠️ 중요: Railway 공개 연결 문자열 필요

`railway run`은 로컬에서 실행되므로 내부 호스트명(`postgres.railway.internal`)에 접근할 수 없습니다.

## 방법 1: 공개 연결 문자열 사용 (가장 쉬움)

### 1단계: Railway에서 공개 연결 문자열 가져오기

1. Railway 대시보드 접속: https://railway.app
2. PostgreSQL 서비스 클릭
3. **"Connect"** 탭 클릭
4. **"Public Network"** 선택
5. 연결 문자열 복사
   - 예: `postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway`

### 2단계: 로컬에서 마이그레이션 실행

```bash
cd /Users/hwanys2/Coding/portpolio/server

# 공개 연결 문자열 설정
export DATABASE_URL="postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway"

# 마이그레이션 실행
npm run migrate:postgres
```

## 방법 2: Railway 서버에서 직접 실행

1. Railway 대시보드 → 웹 서비스 클릭
2. **"Deployments"** 탭
3. 최신 배포 클릭
4. **"Shell"** 탭 클릭 (또는 "View Logs" 옆의 터미널 아이콘)
5. Railway 서버 터미널에서 실행:
   ```bash
   cd server
   npm run migrate:postgres
   ```

이 방법은 Railway 서버 내부에서 실행되므로 내부 호스트명을 사용할 수 있습니다.

## 방법 3: 일회성 스크립트로 Railway에 배포

Railway에서 일회성 스크립트를 실행할 수 있는 서비스를 만들 수도 있지만, 위 두 방법이 더 간단합니다.

## 추천: 방법 1 (공개 연결 문자열)

가장 빠르고 간단합니다. Railway 대시보드에서 공개 연결 문자열만 복사하면 됩니다.
