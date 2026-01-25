import { Link } from 'react-router-dom'
import { useState } from 'react'

export default function TopBar({ user, onLogout }) {
  const isAdmin = user?.email === 'hwanys2'
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleMenuClose = () => {
    setIsMenuOpen(false)
  }

  return (
    <header className="top-bar">
      <Link to="/portfolios" className="brand-link" onClick={handleMenuClose}>
        <img src="/logo.png" alt="Logo" className="top-bar-logo" />
        <span className="brand-subtitle">{user?.email}</span>
      </Link>
      <div className="top-bar-actions">
        {isAdmin && (
          <Link className="btn-ghost" to="/queue" onClick={handleMenuClose}>
            큐 상태
          </Link>
        )}
        <Link className="btn-ghost" to="/portfolios/new" onClick={handleMenuClose}>
          + 새 포트폴리오
        </Link>
        <button type="button" className="btn-ghost" onClick={onLogout}>
          로그아웃
        </button>
      </div>
      <button 
        type="button"
        className="hamburger-btn"
        onClick={handleMenuToggle}
        aria-label="메뉴 열기"
        aria-expanded={isMenuOpen}
      >
        <span className={`hamburger-icon ${isMenuOpen ? 'open' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      {isMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={handleMenuClose}></div>
          <div className="mobile-menu">
            {isAdmin && (
              <Link className="mobile-menu-item" to="/queue" onClick={handleMenuClose}>
                큐 상태
              </Link>
            )}
            <Link className="mobile-menu-item" to="/portfolios/new" onClick={handleMenuClose}>
              + 새 포트폴리오
            </Link>
            <button 
              type="button" 
              className="mobile-menu-item" 
              onClick={() => {
                handleMenuClose()
                onLogout()
              }}
            >
              로그아웃
            </button>
          </div>
        </>
      )}
    </header>
  )
}

