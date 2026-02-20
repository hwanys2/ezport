# 텔레그램 봇 환경 변수 설정 가이드

봇을 생성한 뒤 아래 순서대로 환경 변수만 넣으면 서버에서 텔레그램 메시지 전송이 가능합니다.

---

## 1. 봇 토큰 받기

1. 텔레그램에서 **@BotFather** 검색 후 대화 시작
2. `/newbot` 입력
3. 봇 표시 이름(예: `My Portfolio Bot`) 입력
4. 봇 username 입력 (반드시 `bot`으로 끝나야 함, 예: `my_portfolio_alerts_bot`)
5. BotFather가 준 **토큰** 복사 (형식: `123456789:ABCdefGHI...`)

→ 이 값이 **TELEGRAM_BOT_TOKEN** 입니다.

---

## 2. 채팅 ID(받을 사람) 확인

1. 방금 만든 봇을 검색해서 대화 시작
2. **/start** 입력
3. 브라우저에서 아래 주소 접속 (`<BOT_TOKEN>` 자리에 위에서 받은 토큰 붙여넣기):

   ```
   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   ```

4. JSON 결과에서 `"chat":{"id": 123456789, ...}` 의 **id** 숫자 복사

→ 이 값이 **TELEGRAM_CHAT_ID** 입니다. (숫자만, 따옴표 없이)

---

## 3. 환경 변수 설정

### 로컬 개발 (server/.env)

`server/.env` 파일에 추가 (이미 있으면 해당 줄만 수정):

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI_실제토큰
TELEGRAM_CHAT_ID=123456789
```

- 값에 공백 넣지 마세요.
- `TELEGRAM_CHAT_ID`는 숫자만 (예: `987654321`).

### Railway 배포

1. Railway 대시보드 → 해당 프로젝트 선택
2. **Variables** 탭 (또는 서비스 선택 후 Variables)
3. **New Variable** 또는 **RAW Editor**로 아래 두 개 추가:

   | Variable             | Value                    |
   |----------------------|--------------------------|
   | `TELEGRAM_BOT_TOKEN` | 봇 토큰 (BotFather에서 받은 값) |
   | `TELEGRAM_CHAT_ID`   | 채팅 ID (숫자)              |

4. 저장 후 재배포(또는 자동 재배포)되면 적용됩니다.

---

## 4. 코드에서 사용하기

환경 변수를 설정해 두면 `server/telegram.js` 모듈을 불러와서 사용할 수 있습니다.

```js
const { sendMessage, notify, isConfigured } = require('./telegram');

// 단순 텍스트 전송
await sendMessage('서버가 시작되었습니다.');

// 제목+본문 (HTML)
await notify('배포 알림', 'Railway 배포가 완료되었습니다.');

// 설정 여부 확인
if (isConfigured()) {
  await sendMessage('알림: 중요한 이벤트 발생');
}
```

설정되지 않은 경우(토큰/채팅ID 없음)에는 전송을 건너뛰고 `false`만 반환하므로, 봇을 아직 안 만들었어도 서버는 그대로 동작합니다.

---

## 5. 참고

- **토큰/채팅 ID**는 외부에 노출되지 않도록 `.env`와 Railway Variables에만 두고, 코드나 Git에는 넣지 마세요.
- 그룹에 메시지를 보내려면 봇을 그룹에 추가한 뒤, 그룹에서 아무 메시지 보내고 `getUpdates`로 해당 그룹의 `chat.id`를 확인하면 됩니다 (보통 음수).
