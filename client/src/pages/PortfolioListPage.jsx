import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, getToken } from '../api'
import TopBar from '../components/TopBar'

export default function PortfolioListPage({ user, onLogout }) {
  const [items, setItems] = useState([])
  const [publicPortfolios, setPublicPortfolios] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getToken()
    apiFetch('/api/portfolios', { token })
      .then((data) => setItems(data.items || []))
      .catch(() => setError('포트폴리오 목록을 불러오지 못했습니다.'))
    
    // 공개 포트폴리오 조회 (인증 불필요)
    apiFetch('/api/portfolios/public?limit=6', { skipAuth: true })
      .then((data) => {
        setPublicPortfolios(data.items || [])
      })
      .catch((err) => {
        console.error('[Public Portfolios] Error:', err);
        setPublicPortfolios([]);
      })
  }, [])

  const formatCurrency = (num) => {
    if (num == null) return '-'
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(num)
  }

  return (
    <div className="page">
      <TopBar user={user} onLogout={onLogout} />

      <div className="list-container">
        <div className="list-header">
          <div>
            <h1>내 포트폴리오</h1>
            <p className="subtitle">목표 비중을 관리하고 리밸런싱 제안을 확인하세요</p>
          </div>
          <Link to="/portfolios/new" className="btn-primary">
            + 새 포트폴리오
          </Link>
        </div>

        {error && <div className="toast error">{error}</div>}

        <div className="portfolio-grid">
          {items.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>포트폴리오가 없습니다</h3>
              <p>첫 포트폴리오를 만들어보세요</p>
              <Link to="/portfolios/new" className="btn-primary">
                포트폴리오 만들기
              </Link>
            </div>
          )}
          {items.map((portfolio) => (
            <Link
              key={portfolio.id}
              to={`/portfolios/${portfolio.id}`}
              className="portfolio-card-link"
            >
              <div className="portfolio-card">
                <h3>{portfolio.name}</h3>
                <div className="portfolio-stats">
                  <div className="stat">
                    <span className="stat-label">총 평가금액</span>
                    <span className="stat-value">{formatCurrency(portfolio.current_total_value)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">보유 종목</span>
                    <span className="stat-value">{portfolio.items?.length || 0}개</span>
                  </div>
                </div>
                <div className="portfolio-footer">
                  <span className="view-detail">상세 보기 →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: '64px' }}>
          <div className="list-header">
            <div>
              <h2>다른 사람들의 포트폴리오</h2>
              <p className="subtitle">공개된 포트폴리오를 둘러보세요</p>
            </div>
          </div>
          {publicPortfolios.length > 0 ? (
            <div className="public-portfolio-grid">
              {publicPortfolios.map((portfolio) => (
                <div key={portfolio.id} className="public-portfolio-card">
                  <div className="public-portfolio-header">
                    <h3>{portfolio.name}</h3>
                    <span className="public-portfolio-owner">{portfolio.owner_email}</span>
                  </div>
                  <div className="public-portfolio-chart">
                    {portfolio.items?.slice(0, 6).map((item, idx) => {
                      const displayName = item.name_ko || item.name || item.symbol;
                      return (
                        <div key={item.id || idx} className="public-portfolio-item">
                          <div className="public-portfolio-item-bar">
                            <div
                              className="public-portfolio-item-fill"
                              style={{ width: `${Math.min(item.target_weight, 100)}%` }}
                            />
                          </div>
                          <div className="public-portfolio-item-info">
                            <span className="public-portfolio-item-name">{displayName}</span>
                            <span className="public-portfolio-item-weight">{item.target_weight.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {portfolio.items?.length > 6 && (
                    <div className="public-portfolio-more">
                      +{portfolio.items.length - 6}개 더
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '32px' }}>
              <p style={{ color: '#64748b' }}>아직 공개된 포트폴리오가 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

