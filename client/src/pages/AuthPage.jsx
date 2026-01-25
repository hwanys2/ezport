import { useState } from 'react'
import { apiFetch, setToken } from '../api'

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    
    // 회원가입 시 비밀번호 확인
    if (mode === 'register') {
      if (password !== passwordConfirm) {
        setError('비밀번호가 일치하지 않습니다.')
        return
      }
      if (username.length < 3) {
        setError('아이디는 3자 이상이어야 합니다.')
        return
      }
      if (password.length < 6) {
        setError('비밀번호는 6자 이상이어야 합니다.')
        return
      }
    }
    
    setLoading(true)
    try {
      const body = mode === 'register' 
        ? { username, password, passwordConfirm }
        : { username, password }
      
      const data = await apiFetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        body,
        skipAuth: true,
      })
      setToken(data.token)
      onAuthed()
    } catch (err) {
      setError(err.message || '로그인/회원가입에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="auth-card">
        <h1>포트폴리오 관리</h1>
        <p className="muted">목표 비중과 현재 비중을 비교합니다.</p>
        <form onSubmit={submit}>
          <label>
            아이디
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="3자 이상"
              required 
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              required
            />
          </label>
          {mode === 'register' && (
            <label>
              비밀번호 확인
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
                required
              />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {mode === 'register' ? '회원가입' : '로그인'}
          </button>
        </form>
        <button
          type="button"
          className="link-button"
          onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
        >
          {mode === 'register' ? '이미 계정이 있나요? 로그인' : '계정이 없나요? 회원가입'}
        </button>
      </div>
    </div>
  )
}

