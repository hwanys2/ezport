// 프로덕션에서는 같은 도메인 사용 (상대 경로), 개발 환경에서만 환경 변수 사용
const getApiUrlFromEnv = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // 프로덕션 환경에서는 상대 경로 사용 (같은 도메인에서 서빙됨)
  if (import.meta.env.PROD) {
    return '';
  }
  // 개발 환경 기본값
  return 'http://localhost:4000';
};

const API_URL = getApiUrlFromEnv();

export function getApiUrl() {
  return API_URL;
}

export function getToken() {
  return localStorage.getItem('token') || ''
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token)
  else localStorage.removeItem('token')
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch(path, { token, method, body, skipAuth } = {}) {
  const headers = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  };
  
  // skipAuth가 true가 아니고 token이 제공되면 인증 헤더 추가
  if (!skipAuth && token !== undefined) {
    Object.assign(headers, authHeaders(token));
  }
  
  const res = await fetch(`${API_URL}${path}`, {
    method: method || 'GET',
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const isJson = (res.headers.get('content-type') || '').includes('application/json')
  const data = isJson ? await res.json() : null
  if (!res.ok) {
    const msg = data?.details || data?.error || `Request failed: ${res.status}`
    throw new Error(msg)
  }
  return data
}

