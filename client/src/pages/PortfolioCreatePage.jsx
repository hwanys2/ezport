import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, getToken } from '../api'
import TopBar from '../components/TopBar'

const emptyItem = () => ({
  symbol: '',
  name: '',
  targetWeight: '',
  quantity: '',
  tolerance: '',
  searchQuery: '',
  searchResults: [],
  searchWarning: '',
})

export default function PortfolioCreatePage({ user, onLogout }) {
  const navigate = useNavigate()
  const [portfolioName, setPortfolioName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [items, setItems] = useState([emptyItem()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addRequestingIndex, setAddRequestingIndex] = useState(-1)
  const [lastSearchedQueries, setLastSearchedQueries] = useState({})

  const hasExactTickerMatch = (query, results) => {
    const q = (query || '').trim().toUpperCase()
    if (!q) return false
    return (results || []).some((r) => {
      const s = (r.symbol || '').trim().toUpperCase()
      return s === q || s === `${q}.KS` || s === `${q}.KQ`
    })
  }

  const totalTargetWeight = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.targetWeight || 0), 0),
    [items]
  )

  const handleItemChange = (index, key, value) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const addItem = () => setItems((prev) => [...prev, emptyItem()])
  const removeItem = (index) => setItems((prev) => prev.filter((_, idx) => idx !== index))

  const searchAssets = async (index) => {
    const token = getToken()
    const query = items[index]?.searchQuery?.trim()
    if (!query) return
    try {
      const data = await apiFetch(`/api/assets/search?q=${encodeURIComponent(query)}`, { token })
      setLastSearchedQueries((prev) => ({ ...prev, [index]: query }))
      handleItemChange(index, 'searchResults', data.items || [])
      handleItemChange(index, 'searchWarning', data.warning || '')
    } catch {
      setLastSearchedQueries((prev) => ({ ...prev, [index]: query }))
      handleItemChange(index, 'searchResults', [])
      handleItemChange(index, 'searchWarning', '검색에 실패했습니다. 티커/코드로 다시 시도해 주세요.')
    }
  }

  const selectAsset = (index, asset) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        symbol: asset.symbol,
        name: asset.name,
        searchResults: [],
        searchWarning: '',
      }
      return next
    })
    setLastSearchedQueries((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const requestAddTicker = async (index) => {
    const query = items[index]?.searchQuery?.trim()
    if (!query || addRequestingIndex >= 0) return
    setAddRequestingIndex(index)
    try {
      const token = getToken()
      await apiFetch('/api/queue/add-symbol', {
        token,
        method: 'POST',
        body: { symbol: query },
      })
      handleItemChange(index, 'searchWarning', '종목 등록 요청이 큐에 추가되었습니다. 전체 사용자 요청이 순차적으로 15초 간격으로 처리됩니다. 처리 후 다시 검색해 보시면 등록 여부를 확인할 수 있습니다.')
    } catch (err) {
      handleItemChange(index, 'searchWarning', err.message || '티커 추가 요청에 실패했습니다.')
    } finally {
      setAddRequestingIndex(-1)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const payloadItems = items
      .filter((item) => item.symbol)
      .map((item) => ({
        symbol: item.symbol,
        targetWeight: Number(item.targetWeight),
        quantity: item.quantity === '' || item.quantity === undefined ? 0 : Number(item.quantity),
        tolerance: item.tolerance === '' ? undefined : Number(item.tolerance),
      }))

    if (!portfolioName.trim()) {
      setError('포트폴리오 이름을 입력하세요.')
      return
    }
    if (!payloadItems.length) {
      setError('최소 1개 종목을 추가하세요.')
      return
    }
    if (payloadItems.some((item) => !item.targetWeight || item.targetWeight <= 0)) {
      setError('목표 비중을 모두 입력하세요.')
      return
    }
    if (payloadItems.some((item) => Number.isNaN(item.quantity) || item.quantity < 0)) {
      setError('보유수량은 0 이상의 숫자여야 합니다.')
      return
    }

    setLoading(true)
    try {
      const token = getToken()
      const data = await apiFetch('/api/portfolios', {
        token,
        method: 'POST',
        body: { name: portfolioName, isPublic, items: payloadItems },
      })
      navigate(`/portfolios/${data.id}`)
    } catch {
      setError('포트폴리오 생성에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <TopBar user={user} onLogout={onLogout} />

      <div className="create-container">
        <div className="create-header">
          <h1>새 포트폴리오 만들기</h1>
          <p className="subtitle">종목을 추가하고 목표 비중을 설정하세요</p>
        </div>

        <div className="create-panel">
          <div className="weight-indicator">
            <span className="weight-label">목표 비중 합계</span>
            <span className={`weight-total ${totalTargetWeight === 100 ? 'complete' : totalTargetWeight > 100 ? 'over' : 'under'}`}>
              {totalTargetWeight.toFixed(1)}%
            </span>
            {totalTargetWeight === 100 && <span className="weight-check">✓</span>}
          </div>

          <form onSubmit={submit}>
          <label>
            포트폴리오 이름
            <input value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)} />
          </label>
          <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>포트폴리오 공개</div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>다른 사람들이 이 포트폴리오를 볼 수 있습니다</div>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  id="public-toggle"
                />
                <label htmlFor="public-toggle" className="toggle-label"></label>
              </div>
            </label>
          </div>

          <div className="items">
            {items.map((item, index) => (
              <div className="item-card" key={`${item.symbol}-${index}`}>
                <div className="item-grid">
                  <label>
                    검색
                    <div className="search-row">
                      <input
                        type="text"
                        value={item.searchQuery}
                        onChange={(e) => handleItemChange(index, 'searchQuery', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            searchAssets(index);
                          }
                        }}
                        placeholder="예: kodex200, AAPL, 005930"
                      />
                      <button type="button" onClick={() => searchAssets(index)}>
                        검색
                      </button>
                    </div>
                  </label>
                  <label>
                    티커(종목코드)
                    <input
                      value={item.symbol}
                      onChange={(e) => handleItemChange(index, 'symbol', e.target.value.toUpperCase())}
                      placeholder="AAPL / 069500.KS"
                    />
                  </label>
                  <label>
                    목표 비중 (%)
                    <input
                      type="number"
                      min="0"
                      value={item.targetWeight}
                      onChange={(e) => handleItemChange(index, 'targetWeight', e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    보유수량 (선택)
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      placeholder="없으면 0"
                    />
                  </label>
                  <label>
                    허용오차 (%)
                    <input
                      type="number"
                      min="0"
                      value={item.tolerance}
                      onChange={(e) => handleItemChange(index, 'tolerance', e.target.value)}
                    />
                  </label>
                </div>

                {lastSearchedQueries[index] === item.searchQuery?.trim() && !hasExactTickerMatch(item.searchQuery?.trim(), item.searchResults) && (
                  <div className="search-no-results">
                    <p className="search-no-results-title">입력한 티커와 동일한 종목이 없습니다</p>
                    <p className="search-no-results-text">
                      야후 파이낸스 정식 티커만 등록할 수 있습니다. 한국 주식은 6자리 종목코드 + <strong>.KS</strong>(코스피) 또는 <strong>.KQ</strong>(코스닥), 미국 주식은 영문 티커(예: AAPL)를 사용하세요.
                    </p>
                    <button
                      type="button"
                      className="btn-add-ticker-request"
                      onClick={() => requestAddTicker(index)}
                      disabled={addRequestingIndex >= 0}
                    >
                      {addRequestingIndex === index ? '요청 중...' : '티커 추가요청하기'}
                    </button>
                    <p className="search-no-results-hint">등록 요청은 전체 시스템에서 15초 간격으로 순차 처리됩니다. 처리 후 다시 검색하면 등록 여부를 확인할 수 있습니다.</p>
                  </div>
                )}
                {item.searchWarning && (
                  <div className={`search-warning search-warning-below-request ${item.searchWarning.includes('큐에 추가') ? 'search-warning-success' : ''}`}>{item.searchWarning}</div>
                )}
                {item.searchResults.length > 0 && (
                  <div className="search-results-wrap search-results-fullwidth">
                    <p className="search-results-label">
                      {hasExactTickerMatch(item.searchQuery?.trim(), item.searchResults)
                        ? '티커 일치 · 검색 결과'
                        : '이름/티커 포함 검색 결과'}
                    </p>
                    <div className="search-results-grid">
                      {item.searchResults.map((result) => (
                        <button
                          type="button"
                          key={result.symbol}
                          className="search-result search-result-item"
                          onClick={() => selectAsset(index, result)}
                        >
                          <div className="search-result-main">
                            <strong className="search-result-symbol">{result.symbol}</strong>
                            <span className="search-result-name">
                              {result.name_ko || result.name || result.symbol}
                            </span>
                          </div>
                          {result.name_ko && result.name && result.name !== result.name_ko && (
                            <div className="search-result-name-en">{result.name}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="item-footer">
                  <span className="muted">{item.name}</span>
                  {items.length > 1 && (
                    <button type="button" className="ghost" onClick={() => removeItem(index)}>
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

            {error && <div className="error">{error}</div>}
            <div className="create-actions">
              <button type="button" className="btn-ghost" onClick={addItem}>
                + 종목 추가
              </button>
              <button type="submit" className="btn-primary" disabled={loading || totalTargetWeight !== 100}>
                {totalTargetWeight !== 100 ? `비중 합계를 100%로 맞춰주세요 (현재: ${totalTargetWeight.toFixed(1)}%)` : '포트폴리오 생성'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

