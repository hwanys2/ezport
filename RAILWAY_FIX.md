# Railway 배포 오류 해결 가이드

## 발생한 오류

1. **PostgreSQL 연결 실패**: `ECONNREFUSED ::1:5432`
2. **Node.js 버전 문제**: yahoo-finance2가 Node >= 22.0.0을 요구하는데 18.20.8이 사용됨

## 해결 방법

### 1. Node.js 버전 업데이트 ✅

다음 파일들이 수정되었습니다:
- `nixpacks.toml`: nodejs-18_x → nodejs-22_x
- `Dockerfile`: node:18-alpine → node:22-alpine
- `.node-version`: 22 추가

### 2. PostgreSQL 연결 설정 개선 ✅

`server/db.js`가 수정되어 Railway의 다양한 환경 변수를 지원합니다:
- `DATABASE_URL` (우선순위 1)
- `POSTGRES_URL` (우선순위 2)
- 개별 변수들 (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) (우선순위 3)

## Railway에서 확인할 사항

### 1. PostgreSQL 서비스 확인

Railway 대시보드에서:
1. PostgreSQL 서비스가 실행 중인지 확인
2. PostgreSQL 서비스 → Variables 탭에서 다음 변수들이 있는지 확인:
   - `DATABASE_URL` 또는
   - `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

### 2. 웹 서비스에 PostgreSQL 변수 공유

Railway에서 PostgreSQL 서비스를 추가하면 자동으로 연결되지만, 확인해야 할 사항:

1. 웹 서비스 → Settings → Variables 탭
2. PostgreSQL 관련 변수들이 있는지 확인
3. 없다면 PostgreSQL 서비스 → Variables에서 복사하여 웹 서비스에 추가

### 3. 환경 변수 확인

웹 서비스 → Variables 탭에서 다음 변수들이 설정되어 있는지 확인:

```
NODE_ENV=production
JWT_SECRET=<설정됨>
DATABASE_URL=<PostgreSQL 서비스에서 자동 설정됨>
REDIS_URL=<Redis 서비스에서 자동 설정됨>
VITE_API_URL=https://your-app-name.up.railway.app
```

## 재배포

코드 변경 후 GitHub에 푸시하면 Railway가 자동으로 재배포합니다:

```bash
git add .
git commit -m "Node.js 22로 업그레이드 및 PostgreSQL 연결 개선"
git push origin master
```

또는 Railway 대시보드에서:
1. Deployments 탭
2. "Redeploy" 버튼 클릭

## 문제 해결 체크리스트

- [ ] PostgreSQL 서비스가 실행 중인가?
- [ ] 웹 서비스에 `DATABASE_URL` 또는 PostgreSQL 개별 변수들이 설정되어 있는가?
- [ ] Node.js 버전이 22로 설정되었는가? (재배포 후 확인)
- [ ] Redis 서비스가 실행 중인가?
- [ ] 모든 환경 변수가 올바르게 설정되었는가?

## 로그 확인

Railway 대시보드 → Deployments → 최신 배포 → 로그에서:
- `[DB] Connecting to PostgreSQL...` 메시지 확인
- 연결 정보가 올바르게 표시되는지 확인
- 에러 메시지 확인
