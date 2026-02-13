# Railway PostgreSQL 비밀번호 찾기

## 방법 1: Railway 대시보드에서 확인 (가장 쉬움)

1. Railway 대시보드 접속: https://railway.app
2. **PostgreSQL 서비스** 클릭
3. **"Variables"** 탭 클릭
4. `PGPASSWORD` 변수 찾기 → 값 복사

또는

1. PostgreSQL 서비스 → **"Connect"** 탭 클릭
2. **"Public Network"** 선택
3. 연결 문자열 전체 복사
   - 형식: `postgresql://postgres:비밀번호@shinkansen.proxy.rlwy.net:57514/railway`
   - 여기서 `:` 와 `@` 사이의 부분이 비밀번호입니다

## 방법 2: Railway CLI로 확인

```bash
railway variables
```

또는

```bash
railway variables get PGPASSWORD
```

## 방법 3: 연결 문자열에서 추출

연결 문자열이 있다면:
```
postgresql://postgres:여기가비밀번호@shinkansen.proxy.rlwy.net:57514/railway
```

`postgres:` 다음부터 `@` 앞까지가 비밀번호입니다.

## 빠른 실행

비밀번호를 찾은 후:

```bash
cd /Users/hwanys2/Coding/portpolio/server

# 비밀번호를 여기에 입력
export DATABASE_URL="postgresql://postgres:여기에비밀번호@shinkansen.proxy.rlwy.net:57514/railway"

npm run migrate:postgres
```
