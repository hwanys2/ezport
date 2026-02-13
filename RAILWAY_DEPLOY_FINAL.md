# Railway 배포 최종 가이드 (PostgreSQL 버전)

## ✅ 완료된 작업

1. ✅ PostgreSQL 패키지 설치 (`pg`)
2. ✅ `db.js` PostgreSQL용으로 완전 재작성
3. ✅ 주요 API 엔드포인트 비동기식으로 변경
4. ✅ 스키마 변환 (SQLite → PostgreSQL)
5. ✅ 트랜잭션 로직 수정

## 🚀 Railway 배포 단계

### 1단계: GitHub에 푸시

```bash
git push -u origin master
```

### 2단계: Railway 프로젝트 생성

1. https://railway.app 접속
2. "New Project" → "Deploy from GitHub repo"
3. `hwanys2/ezport` 선택

### 3단계: PostgreSQL 서비스 추가

1. Railway 대시보드 → "New"
2. "Database" → "Add PostgreSQL"
3. PostgreSQL 서비스 생성 완료

### 4단계: Redis 서비스 추가

1. Railway 대시보드 → "New"
2. "Database" → "Add Redis"
3. Redis 서비스 생성 완료

### 5단계: 환경 변수 설정

웹 서비스 → Variables 탭에서 추가:

```
NODE_ENV=production
JWT_SECRET=<강력한 랜덤 문자열>
```

**JWT_SECRET 생성**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6단계: 클라이언트 API URL 설정

웹 서비스 → Variables 탭에서 추가:

```
VITE_API_URL=https://your-app-name.up.railway.app
```

(실제 도메인은 Railway가 생성한 도메인으로 변경)

### 7단계: 배포 확인

1. Deployments 탭에서 빌드 로그 확인
2. 도메인으로 접속하여 테스트

## ⚠️ 주의사항

### 데이터베이스 연결

PostgreSQL 서비스가 생성되면 자동으로 다음 환경 변수가 설정됩니다:
- `DATABASE_URL` 또는 `POSTGRES_URL`

코드는 이 변수를 자동으로 사용합니다.

### 남은 작업

일부 API 엔드포인트와 워커 파일들이 아직 비동기식으로 변경되지 않았습니다.
배포 후 테스트하면서 발견되는 부분을 수정하세요.

자세한 내용은 `POSTGRESQL_MIGRATION.md` 참고.

## 🐛 문제 해결

### 빌드 실패
- 로그 확인: Deployments → 로그 보기
- 로컬에서 `npm run build` 테스트

### 데이터베이스 연결 실패
- PostgreSQL 서비스가 실행 중인지 확인
- `DATABASE_URL` 환경 변수 확인

### Redis 연결 실패
- Redis 서비스가 실행 중인지 확인
- `REDIS_URL` 환경 변수 확인
