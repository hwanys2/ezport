import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, getToken } from '../api'
import TopBar from '../components/TopBar'

export default function PortfolioListPage({ user, onLogout }) {
  const [items, setItems] = useState([])
  const [publicPortfolios, setPublicPortfolios] = useState([])
  const [error, setError] = useState('')
  const [marketIndices, setMarketIndices] = useState([])
  const [indicesError, setIndicesError] = useState('')
  const [indicesLoading, setIndicesLoading] = useState(true)
  const [indicesRequestedAt, setIndicesRequestedAt] = useState(null)

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
      .catch(() => {
        setPublicPortfolios([]);
      })

    let cancelled = false

    const fetchIndices = async ({ silent = false } = {}) => {
      if (cancelled) return
      const activeToken = getToken()

      if (!silent) {
        setIndicesLoading(true)
        setIndicesError('')
      }

      try {
        const data = await apiFetch('/api/market-indices', { token: activeToken })
        if (cancelled) return
        setMarketIndices(data.items || [])
        setIndicesRequestedAt(data.requestedAt || null)
        if (!silent) {
          setIndicesError('')
        }
      } catch (err) {
        if (cancelled) return
        if (!silent) {
          setIndicesError(err.message || '시장 지수 정보를 불러오지 못했습니다.')
        }
      } finally {
        if (cancelled) return
        if (!silent) {
          setIndicesLoading(false)
        }
      }
    }

    fetchIndices()
    const intervalId = setInterval(() => {
      fetchIndices({ silent: true })
    }, 60000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [])

  const formatCurrency = (num) => {
    if (num == null) return '-'
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(num)
  }

  const formatIndexValue = (num, currency) => {
    if (num == null) return '-'
    const effectiveCurrency = currency || 'USD'
    const locale = effectiveCurrency === 'USD' ? 'en-US' : 'ko-KR'
    const maximumFractionDigits = effectiveCurrency === 'KRW' ? 0 : 2
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: effectiveCurrency,
      maximumFractionDigits,
    }).format(num)
  }

  const formatPercent = (value) => {
    if (value == null || Number.isNaN(value)) return '-'
    const rounded = value.toFixed(2)
    return `${value > 0 ? '+' : ''}${rounded}%`
  }

  const formatRelativeTime = (isoString) => {
    if (!isoString) return '업데이트 대기 중'
    const updated = new Date(isoString)
    if (Number.isNaN(updated.getTime())) return '업데이트 대기 중'
    const diffMs = Date.now() - updated.getTime()
    const minutes = Math.floor(diffMs / (60 * 1000))
    if (minutes < 1) return '방금 업데이트'
    if (minutes < 60) return `${minutes}분 전 업데이트`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전 업데이트`
    const days = Math.floor(hours / 24)
    return `${days}일 전 업데이트`
  }

  const formatDaysAgo = (isoString) => {
    if (!isoString) return null
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return null
    const diffMs = Date.now() - date.getTime()
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
    if (days < 1) return '오늘'
    if (days === 1) return '1일 전'
    return `${days}일 전`
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

        <div className="market-overview-section">
          <div className="list-header market-overview-header">
            <div>
              <h2>주요 지수 현재 위치</h2>
              <p className="subtitle">3년 고가 대비 하락률을 확인하세요</p>
            </div>
            {indicesRequestedAt && (
              <div className="market-overview-actions">
                <span className="market-overview-timestamp">
                  {`확인: ${formatRelativeTime(indicesRequestedAt)}`}
                </span>
              </div>
            )}
          </div>

          {indicesError && (
            <div className="inline-error">
              {indicesError}
            </div>
          )}

          <div className="market-indices-grid">
            {indicesLoading && marketIndices.length === 0 &&
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="market-index-card skeleton">
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              ))
            }

            {!indicesLoading && marketIndices.length === 0 && (
              <div className="market-index-empty">
                <p>시장 지수 데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.</p>
              </div>
            )}

            {marketIndices.map((indexInfo) => {
              const dropClass =
                indexInfo.percentDrop == null
                  ? ''
                  : indexInfo.percentDrop <= 0
                    ? 'negative'
                    : 'positive'

              const progressPercent =
                indexInfo.currentPrice != null && indexInfo.high3y
                  ? Math.min(Math.max((indexInfo.currentPrice / indexInfo.high3y) * 100, 0), 120)
                  : 0

              return (
                <div
                  key={indexInfo.symbol}
                  className="market-index-card"
                >
                  <div className="market-index-header">
                    <div>
                      <span className="market-index-label">{indexInfo.label}</span>
                      <span className="market-index-symbol">{indexInfo.symbol}</span>
                    </div>
                    <span className="market-index-region">{indexInfo.region}</span>
                  </div>

                  <div className={`market-index-drop ${dropClass}`}>
                    {formatPercent(indexInfo.percentDrop)}
                  </div>

                  <div className="market-index-progress">
                    <div
                      className="market-index-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="market-index-values">
                    <div>
                      <span className="market-index-value-label">현재</span>
                      <span className="market-index-value">
                        {formatIndexValue(indexInfo.currentPrice, indexInfo.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="market-index-value-label">
                        3년 고가
                        {indexInfo.high3yDate && formatDaysAgo(indexInfo.high3yDate) && (
                          <span className="market-index-high-date">({formatDaysAgo(indexInfo.high3yDate)})</span>
                        )}
                      </span>
                      <span className="market-index-value">
                        {formatIndexValue(indexInfo.high3y, indexInfo.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="market-index-footer">
                    <span className="market-index-updated">
                      {formatRelativeTime(indexInfo.updatedAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
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

