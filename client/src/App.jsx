import './App.css'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import PortfolioListPage from './pages/PortfolioListPage'
import PortfolioCreatePage from './pages/PortfolioCreatePage'
import PortfolioDetailPage from './pages/PortfolioDetailPage'
import QueueStatusPage from './pages/QueueStatusPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import Footer from './components/Footer'
import { apiFetch, getToken, setToken } from './api'

// 페이지별 타이틀 설정
function usePageTitle() {
  const location = useLocation()
  
  useEffect(() => {
    const titles = {
      '/': 'ezport - 포트폴리오 비중 관리, 자동 리밸런싱 계산',
      '/login': '로그인 - ezport',
      '/portfolios': '내 포트폴리오 - ezport',
      '/portfolios/new': '새 포트폴리오 만들기 - ezport',
      '/queue': '큐 상태 - ezport',
      '/privacy': '개인정보처리방침 - ezport',
      '/terms': '서비스 이용약관 - ezport',
    }
    
    // 경로 매칭 (동적 경로 포함)
    let title = titles[location.pathname]
    if (!title) {
      if (location.pathname.startsWith('/portfolios/')) {
        title = '포트폴리오 상세 - ezport'
      } else {
        title = 'ezport - 포트폴리오 비중 관리'
      }
    }
    
    document.title = title
  }, [location.pathname])
}

function RequireAuth({ children }) {
  const token = getToken()
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  const fetchMe = async () => {
    const token = getToken()
    if (!token) {
      setUser(null)
      setReady(true)
      return
    }
    try {
      const data = await apiFetch('/api/me', { token })
      setUser(data)
    } catch {
      setToken('')
      setUser(null)
    } finally {
      setReady(true)
    }
  }

  useEffect(() => {
    fetchMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => {
    setToken('')
    setUser(null)
  }

  if (!ready) return null

  return (
    <BrowserRouter>
      <PageTitleHandler />
      <Routes>
        <Route path="/" element={user ? <Navigate to="/portfolios" replace /> : <LandingPage />} />
        <Route
          path="/login"
          element={user ? <Navigate to="/portfolios" replace /> : <AuthPage onAuthed={fetchMe} />}
        />
        <Route
          path="/portfolios"
          element={
            <RequireAuth>
              <PortfolioListPage user={user} onLogout={logout} />
            </RequireAuth>
          }
        />
        <Route
          path="/portfolios/new"
          element={
            <RequireAuth>
              <PortfolioCreatePage user={user} onLogout={logout} />
            </RequireAuth>
          }
        />
        <Route
          path="/portfolios/:id"
          element={
            <RequireAuth>
              <PortfolioDetailPage user={user} onLogout={logout} />
            </RequireAuth>
          }
        />
        <Route
          path="/queue"
          element={
            <RequireAuth>
              <QueueStatusPage user={user} onLogout={logout} />
            </RequireAuth>
          }
        />
        <Route
          path="/privacy"
          element={<PrivacyPolicyPage user={user} onLogout={logout} />}
        />
        <Route
          path="/terms"
          element={<TermsOfServicePage user={user} onLogout={logout} />}
        />
        <Route path="*" element={<Navigate to={user ? '/portfolios' : '/'} replace />} />
      </Routes>
      <FooterHandler />
    </BrowserRouter>
  )
}

function PageTitleHandler() {
  usePageTitle()
  return null
}

function FooterHandler() {
  const location = useLocation()
  // LandingPage는 자체 푸터가 있으므로 제외
  if (location.pathname === '/' && !getToken()) {
    return null
  }
  return <Footer />
}
