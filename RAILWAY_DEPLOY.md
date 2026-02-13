# Railway 배포 가이드

이 프로젝트는 Railway에 배포할 수 있도록 설정되어 있습니다.

## 배포 전 확인 사항

### ✅ 완료된 설정
1. ✅ 서버에서 클라이언트 정적 파일 서빙 설정 완료
2. ✅ 빌드 스크립트 설정 완료
3. ✅ Railway 설정 파일 생성 완료 (railway.json, Dockerfile, nixpacks.toml)

### ⚠️ 배포 시 필요한 작업

#### 1. Redis 서비스 추가
Railway 대시보드에서 Redis 서비스를 추가해야 합니다:
- Railway 대시보드 → New → Database → Redis 추가
- `REDIS_URL` 환경 변수가 자동으로 설정됩니다

#### 2. SQLite 데이터베이스 영구 저장소 설정
SQLite는 파일 시스템 기반이므로 Railway의 영구 볼륨이 필요합니다:
- Railway 대시보드 → 서비스 설정 → Volumes 탭
- `/app/server/data.sqlite` 경로에 볼륨 마운트
- 또는 PostgreSQL로 마이그레이션 고려 (선택사항)

#### 3. 환경 변수 설정
Railway 대시보드 → Variables 탭에서 다음 환경 변수를 설정:

```
NODE_ENV=production
PORT=4000
JWT_SECRET=<강력한 랜덤 문자열>
REDIS_URL=<Railway가 자동으로 설정>
```

#### 4. 클라이언트 API URL 설정
`client/.env.production` 파일의 `VITE_API_URL`을 Railway 도메인으로 변경:
```
VITE_API_URL=https://your-app-name.up.railway.app
```

또는 Railway 환경 변수로 설정:
```
VITE_API_URL=https://your-app-name.up.railway.app
```

## 배포 단계

### 방법 1: GitHub 연동 (권장)
1. GitHub에 저장소 푸시
2. Railway 대시보드 → New Project → Deploy from GitHub repo
3. 저장소 선택
4. Railway가 자동으로 빌드 및 배포

### 방법 2: Railway CLI 사용
```bash
# Railway CLI 설치
npm i -g @railway/cli

# 로그인
railway login

# 프로젝트 초기화
railway init

# 배포
railway up
```

## 빌드 프로세스

Railway는 다음 순서로 빌드합니다:
1. `npm run build` 실행 (루트 package.json)
   - 클라이언트 의존성 설치 및 빌드
   - 서버 의존성 설치
2. `npm start` 실행
   - 서버 시작 (포트는 Railway가 자동 할당)

## 주의사항

1. **SQLite 파일 경로**: 
   - 프로덕션에서는 `/app/server/data.sqlite` 경로에 저장됩니다
   - 영구 볼륨을 마운트하지 않으면 재배포 시 데이터가 손실됩니다

2. **Redis 연결**:
   - Redis 서비스가 실행 중이어야 큐 작업이 정상 작동합니다
   - Redis가 없으면 큐 작업이 실패할 수 있습니다

3. **환경 변수**:
   - `JWT_SECRET`은 반드시 강력한 랜덤 문자열로 설정하세요
   - 프로덕션에서는 기본값을 사용하지 마세요

4. **포트**:
   - Railway가 자동으로 `PORT` 환경 변수를 설정합니다
   - 코드에서 `process.env.PORT`를 사용하므로 자동으로 처리됩니다

## 문제 해결

### 빌드 실패
- Railway 로그 확인: Railway 대시보드 → Deployments → 로그 확인
- 로컬에서 `npm run build` 테스트

### Redis 연결 실패
- Redis 서비스가 추가되었는지 확인
- `REDIS_URL` 환경 변수가 설정되었는지 확인

### 데이터베이스 파일 손실
- 영구 볼륨이 마운트되었는지 확인
- PostgreSQL로 마이그레이션 고려

### 클라이언트가 API를 찾지 못함
- `VITE_API_URL` 환경 변수 확인
- 클라이언트 빌드 시 환경 변수가 포함되었는지 확인
