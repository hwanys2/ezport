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
      handleItemChange(index, 'searchResults', data.items || [])
      handleItemChange(index, 'searchWarning', data.warning || '')
    } catch {
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
                    티커/심볼
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

                {item.searchResults.length > 0 && (
                  <div className="search-results">
                    {item.searchResults.map((result) => (
                      <button
                        type="button"
                        key={result.symbol}
                        className="search-result"
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
                )}
                {item.searchWarning && <div className="search-warning">{item.searchWarning}</div>}

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

