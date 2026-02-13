# Railway 배포 단계별 가이드

## 📋 사전 준비사항

- [x] GitHub 저장소: https://github.com/hwanys2/ezport.git
- [x] Railway 배포 설정 파일 생성 완료
- [ ] GitHub에 코드 푸시
- [ ] Railway 계정 생성

---

## 1단계: GitHub에 코드 푸시

### 1.1 변경사항 커밋

```bash
# 현재 디렉토리에서 실행
cd /Users/hwanys2/Coding/portpolio

# 변경사항 추가
git add .

# 커밋
git commit -m "Railway 배포 설정 추가"

# GitHub remote 추가 (아직 없다면)
git remote add origin https://github.com/hwanys2/ezport.git

# 푸시
git push -u origin master
```

**주의**: `server/data.sqlite` 파일은 `.gitignore`에 포함되어 있어 자동으로 제외됩니다.

---

## 2단계: Railway 계정 생성 및 프로젝트 생성

### 2.1 Railway 계정 생성

1. https://railway.app 접속
2. "Start a New Project" 클릭
3. GitHub로 로그인 (권장) 또는 이메일로 가입

### 2.2 새 프로젝트 생성

1. Railway 대시보드에서 **"New Project"** 클릭
2. **"Deploy from GitHub repo"** 선택
3. GitHub 저장소 목록에서 **`hwanys2/ezport`** 선택
4. Railway가 자동으로 저장소를 감지하고 빌드 시작

---

## 3단계: 서비스 설정

### 3.1 메인 서비스 확인

- Railway가 자동으로 웹 서비스를 생성합니다
- 서비스 이름을 클릭하여 설정 페이지로 이동

### 3.2 환경 변수 설정

서비스 설정 → **Variables** 탭에서 다음 환경 변수 추가:

```
NODE_ENV=production
PORT=4000
JWT_SECRET=<강력한 랜덤 문자열 생성>
```

**JWT_SECRET 생성 방법**:
```bash
# 터미널에서 실행
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

또는 온라인 생성기 사용: https://randomkeygen.com/

### 3.3 포트 설정 확인

- Railway가 자동으로 `PORT` 환경 변수를 설정합니다
- 코드에서 `process.env.PORT`를 사용하므로 자동 처리됩니다

---

## 4단계: Redis 서비스 추가

### 4.1 Redis 추가

1. Railway 대시보드에서 **"New"** 클릭
2. **"Database"** → **"Add Redis"** 선택
3. Redis 서비스가 생성됩니다

### 4.2 Redis 연결 정보 확인

- Redis 서비스 → **Variables** 탭
- `REDIS_URL` 환경 변수가 자동으로 설정됩니다
- 이 값은 웹 서비스에서 자동으로 사용 가능합니다 (같은 프로젝트 내)

---

## 5단계: 데이터베이스 선택 및 설정

### 옵션 A: PostgreSQL (권장) ⭐

#### 5A.1 PostgreSQL 서비스 추가

1. Railway 대시보드에서 **"New"** 클릭
2. **"Database"** → **"Add PostgreSQL"** 선택
3. PostgreSQL 서비스가 생성됩니다

#### 5A.2 PostgreSQL 연결 정보 확인

- PostgreSQL 서비스 → **Variables** 탭
- `DATABASE_URL` 또는 `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` 확인
- 이 값들은 웹 서비스에서 자동으로 사용 가능합니다

#### 5A.3 코드 마이그레이션 필요

⚠️ **주의**: PostgreSQL을 사용하려면 코드 변경이 필요합니다.
- `better-sqlite3` → `pg` 변경
- 동기식 → 비동기식 API 변경

**마이그레이션 가이드**: 별도 문서 참조 (필요시 작성)

---

### 옵션 B: SQLite + 볼륨 (빠른 배포)

#### 5B.1 볼륨 생성

1. 웹 서비스 → **Settings** 탭
2. **Volumes** 섹션으로 스크롤
3. **"New Volume"** 클릭
4. 마운트 경로: `/app/server/data.sqlite`
5. 볼륨 생성

#### 5B.2 주의사항

- 볼륨은 빌드 타임에 접근 불가
- 재배포 시 데이터 유지됨
- 단일 인스턴스만 가능

---

## 6단계: 클라이언트 API URL 설정

### 6.1 Railway 도메인 확인

1. 웹 서비스 → **Settings** 탭
2. **Domains** 섹션에서 도메인 확인
   - 예: `ezport-production.up.railway.app`
   - 또는 커스텀 도메인 설정 가능

### 6.2 환경 변수 추가

웹 서비스 → **Variables** 탭에서:

```
VITE_API_URL=https://your-app-name.up.railway.app
```

**주의**: `VITE_` 접두사가 있는 변수는 빌드 타임에 클라이언트 코드에 포함됩니다.

### 6.3 재배포

환경 변수 변경 후 자동으로 재배포됩니다.

---

## 7단계: 배포 확인

### 7.1 빌드 로그 확인

1. 웹 서비스 → **Deployments** 탭
2. 최신 배포 클릭
3. 빌드 로그 확인:
   - ✅ "Build successful"
   - ✅ "Deploy successful"

### 7.2 애플리케이션 테스트

1. Railway 도메인으로 접속
2. 회원가입/로그인 테스트
3. 포트폴리오 생성 테스트
4. API 동작 확인

### 7.3 문제 해결

**빌드 실패 시**:
- 로그 확인: Deployments → 로그 보기
- 로컬에서 `npm run build` 테스트
- 환경 변수 확인

**Redis 연결 실패**:
- Redis 서비스가 실행 중인지 확인
- `REDIS_URL` 환경 변수 확인

**데이터베이스 오류**:
- PostgreSQL: 연결 정보 확인
- SQLite: 볼륨 마운트 확인

---

## 8단계: 커스텀 도메인 설정 (선택사항)

### 8.1 도메인 추가

1. 웹 서비스 → **Settings** → **Domains**
2. **"Custom Domain"** 클릭
3. 도메인 입력 (예: `ezport.kr`)
4. DNS 설정 안내 따르기

### 8.2 DNS 설정

도메인 제공업체에서 CNAME 레코드 추가:
```
Type: CNAME
Name: @ (또는 www)
Value: your-app-name.up.railway.app
```

---

## ✅ 체크리스트

배포 완료 확인:

- [ ] GitHub에 코드 푸시 완료
- [ ] Railway 프로젝트 생성 완료
- [ ] 환경 변수 설정 완료 (`NODE_ENV`, `JWT_SECRET`, `PORT`)
- [ ] Redis 서비스 추가 완료
- [ ] 데이터베이스 설정 완료 (PostgreSQL 또는 SQLite 볼륨)
- [ ] `VITE_API_URL` 환경 변수 설정 완료
- [ ] 빌드 성공 확인
- [ ] 애플리케이션 동작 확인
- [ ] 커스텀 도메인 설정 (선택)

---

## 🆘 문제 해결

### 빌드 실패
```bash
# 로컬에서 테스트
npm run build
```

### 환경 변수 확인
- Railway 대시보드 → Variables 탭
- 모든 필수 변수가 설정되었는지 확인

### 로그 확인
- Railway 대시보드 → Deployments → 로그 보기
- 서버 로그에서 에러 메시지 확인

### 데이터베이스 연결 실패
- PostgreSQL: `DATABASE_URL` 확인
- SQLite: 볼륨 마운트 경로 확인

---

## 📚 추가 자료

- Railway 공식 문서: https://docs.railway.app
- 프로젝트 배포 가이드: `RAILWAY_DEPLOY.md`
- 데이터베이스 비교: `DATABASE_COMPARISON.md`
