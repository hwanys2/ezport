/**
 * 주요 지수 "현재 위치" 상태 정의 및 계산
 * 상태가 나쁜 쪽(숫자 큰 쪽)으로 바뀔 때만 알림 전송
 */

// 상태 상수 (1=가장 좋음, 6=가장 나쁨)
const STATE_NEAR_HIGH_RISING = 1;   // 고가 상승중
const STATE_NEAR_HIGH = 2;          // 고가 부근
const STATE_DROP_10 = 3;            // 10% 하락
const STATE_DROP_20 = 4;            // 20% 하락
const STATE_DROP_30 = 5;            // 30% 하락
const STATE_DROP_40 = 6;            // 40% 하락

const STATE_LABELS = {
  [STATE_NEAR_HIGH_RISING]: '고가 상승중',
  [STATE_NEAR_HIGH]: '고가 부근',
  [STATE_DROP_10]: '10% 하락',
  [STATE_DROP_20]: '20% 하락',
  [STATE_DROP_30]: '30% 하락',
  [STATE_DROP_40]: '40% 하락',
};

/** 고가가 "최근"인지 판단 (고가 상승중 여부) - 최근 180일 이내 고가면 true */
const HIGH_RECENT_DAYS = 180;

function isHighRecent(high3yDate) {
  if (!high3yDate) return false;
  const d = typeof high3yDate === 'string' ? new Date(high3yDate) : high3yDate;
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const diffMs = now - d.getTime();
  return diffMs <= HIGH_RECENT_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * percent_drop(고가 대비 하락률, %)과 고가 발생일로 현재 상태 계산
 * @param {number|null} percentDrop - 고가 대비 하락률 (예: -15면 15% 하락)
 * @param {string|Date|null} high3yDate - 3년 고가 발생일
 * @returns {number|null} 1~6 상태값, 데이터 없으면 null
 */
function getIndexState(percentDrop, high3yDate) {
  if (percentDrop == null || typeof percentDrop !== 'number' || Number.isNaN(percentDrop)) {
    return null;
  }

  // 1. 고가 상승중: 고가가 최근에 갱신되었고, 고가 대비 -3% 이내
  if (isHighRecent(high3yDate) && percentDrop >= -3) {
    return STATE_NEAR_HIGH_RISING;
  }
  // 2. 고가 부근: 고가 상승중이 아니면서 고가 대비 -10% 이내
  if (percentDrop >= -10) {
    return STATE_NEAR_HIGH;
  }
  // 3. 10% 하락: -20% ~ -10%
  if (percentDrop >= -20) {
    return STATE_DROP_10;
  }
  // 4. 20% 하락: -30% ~ -20%
  if (percentDrop >= -30) {
    return STATE_DROP_20;
  }
  // 5. 30% 하락: -40% ~ -30%
  if (percentDrop >= -40) {
    return STATE_DROP_30;
  }
  // 6. 40% 하락: -40% 넘어섬
  return STATE_DROP_40;
}

function getStateLabel(state) {
  if (state == null) return null;
  return STATE_LABELS[state] ?? null;
}

/** 상태가 악화됐는지 (숫자가 커졌는지). 악화 시에만 알림 */
function isStateWorse(prevState, newState) {
  if (prevState == null) return false; // 이전 상태 없으면 알림 안 함
  if (newState == null) return false;
  return newState > prevState;
}

module.exports = {
  STATE_NEAR_HIGH_RISING,
  STATE_NEAR_HIGH,
  STATE_DROP_10,
  STATE_DROP_20,
  STATE_DROP_30,
  STATE_DROP_40,
  STATE_LABELS,
  getIndexState,
  getStateLabel,
  isStateWorse,
};
