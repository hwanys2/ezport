# 지금 바로 마이그레이션 실행하기

## Railway PostgreSQL 공개 연결 정보
- 호스트: `shinkansen.proxy.rlwy.net`
- 포트: `57514`

## 실행 방법

### 1단계: Railway에서 비밀번호 확인

Railway 대시보드 → PostgreSQL 서비스 → Connect → Public Network에서 전체 연결 문자열을 복사하세요.

연결 문자열 형식:
```
postgresql://postgres:비밀번호@shinkansen.proxy.rlwy.net:57514/railway
```

### 2단계: 마이그레이션 실행

```bash
cd /Users/hwanys2/Coding/portpolio/server

# 연결 문자열 설정 (비밀번호 부분을 실제 값으로 교체)
export DATABASE_URL="postgresql://postgres:비밀번호@shinkansen.proxy.rlwy.net:57514/railway"

# 마이그레이션 실행
npm run migrate:postgres
```

## 빠른 실행 (비밀번호만 입력하면 됨)

Railway 대시보드에서 전체 연결 문자열을 복사한 후:

```bash
cd /Users/hwanys2/Coding/portpolio/server
export DATABASE_URL="여기에_복사한_전체_연결_문자열_붙여넣기"
npm run migrate:postgres
```
