import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { apiFetch, getToken } from '../api'

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

export default function PortfolioDetailPage({ user, onLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState({})
  const [editValues, setEditValues] = useState({})
  const [editingCash, setEditingCash] = useState(false)
  const [additionalCash, setAdditionalCash] = useState(0)
  const [isPublic, setIsPublic] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')

  // Add item state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItem, setNewItem] = useState(emptyItem())
  const [lastSearchedQuery, setLastSearchedQuery] = useState('')
  const [addRequesting, setAddRequesting] = useState(false)

  const token = getToken()

  const hasExactTickerMatch = (query, results) => {
    const q = (query || '').trim().toUpperCase()
    if (!q) return false
    return (results || []).some((r) => {
      const s = (r.symbol || '').trim().toUpperCase()
      return s === q || s === `${q}.KS` || s === `${q}.KQ`
    })
  }

  const fetchPortfolio = async () => {
    try {
      const data = await apiFetch(`/api/portfolios/${id}`, { token })
      setPortfolio(data)
      setAdditionalCash(data.additional_cash ?? 0)
      setIsPublic(data.is_public === 1)
      setTitle(data.name || '')
      setMemo(data.memo || '')
      const initialValues = {}
      data.items.forEach((item) => {
        initialValues[item.id] = {
          targetWeight: item.target_weight,
          quantity: item.current_quantity,
          tolerance: item.tolerance,
          nickname: item.nickname || '',
        }
      })
      setEditValues(initialValues)
    } catch {
      setError('포트폴리오를 불러올 수 없습니다.')
    }
  }

  const handleSaveAdditionalCash = async () => {
    setLoading(true)
    try {
      await apiFetch(`/api/portfolios/${id}`, {
        token,
        method: 'PUT',
        body: { additionalCash: Number(additionalCash) },
      })
      setEditingCash(false)
      await fetchPortfolio()
    } catch {
      setError('추가 현금 저장 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePublic = async (newValue) => {
    setLoading(true)
    try {
      await apiFetch(`/api/portfolios/${id}`, {
        token,
        method: 'PUT',
        body: { isPublic: newValue },
      })
      setIsPublic(newValue)
    } catch {
      setError('공개 설정 변경 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTitleAndMemo = async () => {
    setLoading(true)
    try {
      await apiFetch(`/api/portfolios/${id}`, {
        token,
        method: 'PUT',
        body: { name: title.trim(), memo: memo.trim() || null },
      })
      setEditingTitle(false)
      await fetchPortfolio()
    } catch {
      setError('제목/메모 저장 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePortfolio = async () => {
    if (!window.confirm('정말 이 포트폴리오를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      return
    }

    setLoading(true)
    try {
      await apiFetch(`/api/portfolios/${id}`, {
        token,
        method: 'DELETE',
      })
      navigate('/portfolios')
    } catch {
      setError('포트폴리오 삭제 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPortfolio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleRefresh = async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/portfolios/${id}/refresh`, {
        token,
        method: 'POST',
      })
      setPortfolio(data)
    } catch {
      setError('가격 새로고침 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveItem = async (itemId) => {
    setLoading(true)
    try {
      const vals = editValues[itemId]
      await apiFetch(`/api/portfolio-items/${itemId}`, {
        token,
        method: 'PUT',
        body: {
          targetWeight: Number(vals.targetWeight),
          currentQuantity: Number(vals.quantity),
          tolerance: Number(vals.tolerance),
          nickname: vals.nickname || '',
        },
      })
      setEditMode((prev) => ({ ...prev, [itemId]: false }))
      await fetchPortfolio()
    } catch {
      setError('저장 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteItem = async (itemId) => {
    if (!confirm('이 종목을 삭제하시겠습니까?')) return
    setLoading(true)
    try {
      await apiFetch(`/api/portfolio-items/${itemId}`, { token, method: 'DELETE' })
      await fetchPortfolio()
    } catch {
      setError('삭제 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!newItem.symbol || !newItem.symbol.trim()) {
      setError('종목을 선택해주세요')
      return
    }
    
    const targetWeight = Number(newItem.targetWeight)
    const quantity = Number(newItem.quantity)
    const tolerance = newItem.tolerance ? Number(newItem.tolerance) : 0
    
    if (isNaN(targetWeight) || targetWeight <= 0) {
      setError('목표 비중은 0보다 큰 숫자여야 합니다')
      return
    }
    
    if (isNaN(quantity) || quantity < 0) {
      setError('수량은 0 이상의 숫자여야 합니다')
      return
    }
    
    if (isNaN(tolerance) || tolerance < 0) {
      setError('허용 오차는 0 이상의 숫자여야 합니다')
      return
    }
    
    setLoading(true)
    setError('')
    
    const payload = {
      symbol: newItem.symbol.trim(),
      targetWeight,
      quantity,
      tolerance,
    }
    
    console.log('[Add Item] Sending payload:', payload)
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const response = await fetch(`${apiUrl}/api/portfolios/${id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
      
      const data = await response.json()
      console.log('[Add Item] Response:', { status: response.status, data })
      
      if (!response.ok) {
        const errorMsg = data.details || data.error || `서버 오류 (${response.status})`
        console.error('[Add Item] Error:', errorMsg)
        throw new Error(errorMsg)
      }
      
      setNewItem(emptyItem())
      setShowAddForm(false)
      await fetchPortfolio()
    } catch (err) {
      console.error('[Add Item] Exception:', err)
      setError(err.message || '종목 추가 실패')
    } finally {
      setLoading(false)
    }
  }

  const searchAssets = async () => {
    const query = newItem.searchQuery?.trim()
    if (!query) return
    try {
      const data = await apiFetch(
        `/api/assets/search?q=${encodeURIComponent(query)}`,
        { token }
      )
      setLastSearchedQuery(query)
      setNewItem((prev) => ({
        ...prev,
        searchResults: data.items || [],
        searchWarning: data.warning || '',
      }))
    } catch {
      setLastSearchedQuery(query)
      setNewItem((prev) => ({
        ...prev,
        searchResults: [],
        searchWarning: '검색 실패',
      }))
    }
  }

  const selectAsset = (asset) => {
    setNewItem((prev) => ({
      ...prev,
      symbol: asset.symbol,
      name: asset.name,
      searchResults: [],
      searchWarning: '',
    }))
    setLastSearchedQuery('')
  }

  const requestAddTicker = async () => {
    const symbol = newItem.searchQuery?.trim()
    if (!symbol || addRequesting) return
    setAddRequesting(true)
    try {
      await apiFetch('/api/queue/add-symbol', {
        token,
        method: 'POST',
        body: { symbol },
      })
      setNewItem((prev) => ({
        ...prev,
        searchWarning: '종목 등록 요청이 큐에 추가되었습니다. 전체 사용자 요청이 순차적으로 15초 간격으로 처리됩니다. 처리 후 다시 검색해 보시면 등록 여부를 확인할 수 있습니다.',
      }))
    } catch (err) {
      setNewItem((prev) => ({ ...prev, searchWarning: err.message || '티커 추가 요청에 실패했습니다.' }))
    } finally {
      setAddRequesting(false)
    }
  }

  if (!portfolio) return null

  const totalTargetWeight = portfolio.items.reduce(
    (sum, item) => sum + item.target_weight,
    0
  )
  const totalCurrentWeight = portfolio.items.reduce(
    (sum, item) => sum + item.current_weight,
    0
  )

  const formatNumber = (num) => {
    if (num == null) return '-'
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(
      num
    )
  }

  const formatCurrency = (num) => {
    if (num == null) return '-'
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(num)
  }

  const formatCurrencyUSD = (num) => {
    if (num == null) return '-'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(num)
  }

  /** 현재가가 마지막으로 업데이트된 시점 표시: 1시간 이내 / N시간전 (업데이트가 진행중입니다.) / N일전 (업데이트가 진행중입니다.) */
  const formatPriceUpdatedAt = (isoString) => {
    if (!isoString) return null
    const updated = new Date(isoString)
    const now = new Date()
    const diffMs = now - updated
    const diffMinutes = diffMs / (1000 * 60)
    const diffHours = diffMs / (1000 * 60 * 60)
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffMinutes < 60) return '1시간 이내'
    if (diffHours < 24) {
      const hours = Math.floor(diffHours)
      return `${hours}시간전 (업데이트가 진행중입니다.)`
    }
    const days = Math.floor(diffDays)
    return `${days}일전 (업데이트가 진행중입니다.)`
  }

  return (
    <div className="page">
      <TopBar user={user} onLogout={onLogout} />

      <div className="detail-container">
        <div className="detail-header-bar">
          <button className="back-button" onClick={() => navigate('/portfolios')}>
            ← 목록
          </button>
          <div className="portfolio-title-section">
            {editingTitle ? (
              <div className="title-edit-form">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="title-input"
                  placeholder="포트폴리오 제목"
                  autoFocus
                />
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="memo-input"
                  placeholder="포트폴리오 목적이나 메모를 입력하세요..."
                  rows={3}
                />
                <div className="title-edit-actions">
                  <button
                    className="icon-btn success"
                    onClick={handleSaveTitleAndMemo}
                    disabled={loading || !title.trim()}
                    title="저장"
                  >
                    ✓
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingTitle(false)
                      setTitle(portfolio.name || '')
                      setMemo(portfolio.memo || '')
                    }}
                    title="취소"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="portfolio-title-display">
                <h1>
                  {portfolio.name}
                  <button
                    className="icon-btn edit-title-btn"
                    onClick={() => setEditingTitle(true)}
                    title="제목/메모 수정"
                  >
                    ✏️
                  </button>
                </h1>
                {portfolio.memo && (
                  <p className="portfolio-memo">{portfolio.memo}</p>
                )}
              </div>
            )}
          </div>
          <div className="detail-header-actions">
            <div className="public-toggle-compact">
              <span className="public-toggle-label">공개</span>
              <div className="toggle-switch toggle-switch-compact">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => handleTogglePublic(e.target.checked)}
                  id="public-toggle-header"
                  disabled={loading}
                />
                <label htmlFor="public-toggle-header" className="toggle-label"></label>
              </div>
            </div>
            <button
              className="btn-danger"
              onClick={handleDeletePortfolio}
              disabled={loading}
            >
              삭제
            </button>
          </div>
        </div>

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">현재 평가금액</div>
            <div className="summary-value">{formatCurrency(portfolio.current_total_value)}</div>
          </div>
          <div className="summary-card clickable" onClick={() => setEditingCash(true)}>
            <div className="summary-label">추가 현금 {editingCash ? '' : '(클릭하여 수정)'}</div>
            {editingCash ? (
              <div className="cash-edit-row">
                <input
                  type="number"
                  value={additionalCash}
                  onChange={(e) => setAdditionalCash(e.target.value)}
                  className="cash-input"
                  autoFocus
                />
                <button className="icon-btn success" onClick={handleSaveAdditionalCash}>
                  ✓
                </button>
                <button className="icon-btn" onClick={() => {
                  setEditingCash(false)
                  setAdditionalCash(portfolio.additional_cash ?? 0)
                }}>
                  ✕
                </button>
              </div>
            ) : (
              <div className="summary-value cash-value">
                {additionalCash >= 0 ? '+' : ''}{formatCurrency(additionalCash)}
              </div>
            )}
          </div>
          <div className="summary-card highlight">
            <div className="summary-label">목표 평가금액</div>
            <div className="summary-value">{formatCurrency(portfolio.target_total_value)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">보유 종목 수</div>
            <div className="summary-value">{portfolio.items.length}개</div>
          </div>
        </div>

        <div className="detail-info-banner">
          <p className="detail-info-main">
            본 페이지에 접속하면 이 포트폴리오의 종목 현재가 업데이트가 자동으로 시작됩니다.
          </p>
          <p className="detail-info-sub">
            최근 1시간 이내에 조회된 종목은 그대로 유지되며, 그 외 종목은 최대 1~2분 안에 순차적으로 업데이트됩니다.
          </p>
        </div>

        <div className="actions-bar">
          <button
            className="btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? '취소' : '+ 종목 추가'}
          </button>
        </div>

        {showAddForm && (
          <div className="add-form-card">
            <h3>새 종목 추가</h3>
            <form onSubmit={handleAddItem}>
              <div className="form-row">
                <div className="form-group">
                  <label>검색</label>
                  <div className="search-input-group">
                    <input
                      type="text"
                      value={newItem.searchQuery}
                      onChange={(e) =>
                        setNewItem({ ...newItem, searchQuery: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          searchAssets();
                        }
                      }}
                      placeholder="삼성전자, AAPL, KODEX 200..."
                    />
                    <button type="button" onClick={searchAssets}>
                      검색
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>티커(종목코드)</label>
                  <input
                    value={newItem.symbol}
                    onChange={(e) =>
                      setNewItem({ ...newItem, symbol: e.target.value.toUpperCase() })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>목표 비중 (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItem.targetWeight}
                    onChange={(e) =>
                      setNewItem({ ...newItem, targetWeight: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>보유수량</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newItem.quantity}
                    onChange={(e) =>
                      setNewItem({ ...newItem, quantity: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>허용오차 (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItem.tolerance}
                    onChange={(e) =>
                      setNewItem({ ...newItem, tolerance: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="search-feedback-fullwidth">
                {lastSearchedQuery && lastSearchedQuery === newItem.searchQuery?.trim() && !hasExactTickerMatch(lastSearchedQuery, newItem.searchResults) && (
                  <div className="search-no-results">
                    <p className="search-no-results-title">입력한 티커와 동일한 종목이 없습니다</p>
                    <p className="search-no-results-text">
                      야후 파이낸스 정식 티커만 등록할 수 있습니다. 한국 주식은 6자리 종목코드 + <strong>.KS</strong>(코스피) 또는 <strong>.KQ</strong>(코스닥), 미국 주식은 영문 티커(예: AAPL)를 사용하세요.
                    </p>
                      <button
                        type="button"
                        className="btn-add-ticker-request"
                        onClick={requestAddTicker}
                        disabled={addRequesting}
                      >
                        {addRequesting ? '요청 중...' : '티커 추가요청하기'}
                      </button>
                      <p className="search-no-results-hint">등록 요청은 전체 시스템에서 15초 간격으로 순차 처리됩니다. 처리 후 다시 검색하면 등록 여부를 확인할 수 있습니다.</p>
                  </div>
                )}
                {newItem.searchWarning && (
                  <div className={`search-warning-box search-warning-below-request ${newItem.searchWarning.includes('큐에 추가') ? 'success' : ''}`}>{newItem.searchWarning}</div>
                )}
                {newItem.searchResults.length > 0 && (
                  <div className="search-results-wrap search-results-fullwidth">
                    <p className="search-results-label">
                      {hasExactTickerMatch(newItem.searchQuery?.trim(), newItem.searchResults)
                        ? '티커 일치 · 검색 결과'
                        : '이름/티커 포함 검색 결과'}
                    </p>
                    <div className="search-results-grid">
                      {newItem.searchResults.map((result) => {
                        const displayName = result.name_ko || result.name || result.symbol;
                        return (
                          <button
                            key={result.symbol}
                            type="button"
                            onClick={() => selectAsset(result)}
                            className="search-result-item"
                          >
                            <div className="search-result-main">
                              <strong>{displayName}</strong>
                            </div>
                            <div className="search-result-symbol">{result.symbol}</div>
                            {result.name_ko && result.name && result.name !== result.name_ko && (
                              <div className="search-result-name-en">{result.name}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                추가
              </button>
            </form>
          </div>
        )}

        <div className="holdings-grid">
          {portfolio.items.map((item) => {
            const isEditing = editMode[item.id]
            const vals = editValues[item.id] || {}

            return (
              <div
                key={item.id}
                className={`holding-card ${item.out_of_range ? 'out-of-range' : ''}`}
              >
                <div className="holding-header">
                  <div>
                    <div className="symbol-row">
                      <h3>
                        {item.nickname || item.name_ko || item.name || item.symbol}
                      </h3>
                    </div>
                    <p className="holding-symbol">{item.symbol}</p>
                    {item.nickname ? (
                      <>
                        {item.name_ko && (
                          <p className="holding-name-en">{item.name_ko}</p>
                        )}
                        {item.name && item.name !== item.name_ko && (
                          <p className="holding-name-en">{item.name}</p>
                        )}
                      </>
                    ) : (
                      item.name_ko && item.name && item.name !== item.name_ko && (
                        <p className="holding-name-en">{item.name}</p>
                      )
                    )}
                  </div>
                  <div className="holding-actions">
                    {!isEditing && (
                      <>
                        <button
                          className="icon-btn"
                          onClick={() => setEditMode({ ...editMode, [item.id]: true })}
                          title="수정"
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => handleDeleteItem(item.id)}
                          title="삭제"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                    {isEditing && (
                      <>
                        <button
                          className="icon-btn success"
                          onClick={() => handleSaveItem(item.id)}
                          title="저장"
                        >
                          ✓
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => setEditMode({ ...editMode, [item.id]: false })}
                          title="취소"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="weight-section">
                  <div className="weight-bar-container">
                    <div className="weight-labels">
                      <span>목표: {formatNumber(item.target_weight)}%</span>
                      <span>현재: {formatNumber(item.current_weight)}%</span>
                    </div>
                    <div className="weight-bar">
                      <div
                        className="weight-bar-target"
                        style={{ width: `${Math.min(item.target_weight, 100)}%` }}
                      />
                      <div
                        className="weight-bar-current"
                        style={{ width: `${Math.min(item.current_weight, 100)}%` }}
                      />
                    </div>
                    <div className="weight-diff">
                      차이: {item.diff >= 0 ? '+' : ''}
                      {formatNumber(item.diff)}%
                    </div>
                  </div>
                </div>

                <div className="holding-details">
                  {isEditing && (
                    <div className="detail-row">
                      <span>별명</span>
                      <input
                        type="text"
                        value={vals.nickname ?? ''}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [item.id]: { ...vals, nickname: e.target.value },
                          })
                        }
                        className="inline-input"
                        placeholder="예: 삼성전자, 미국 배당 ETF..."
                      />
                    </div>
                  )}
                  <div className="detail-row">
                    <span>현재가</span>
                    <div className="current-price-cell">
                      <strong>
                        {item.currency === 'USD' ? (
                          <>
                            {formatCurrency(item.latest_price_krw)}
                            <span style={{ marginLeft: '8px', fontSize: '0.9em', color: '#64748b', fontWeight: 'normal' }}>
                              ({formatCurrencyUSD(item.latest_price)})
                            </span>
                          </>
                        ) : (
                          formatCurrency(item.latest_price)
                        )}
                      </strong>
                      {item.latest_price_updated_at && (
                        <span className="price-updated-at">
                          {formatPriceUpdatedAt(item.latest_price_updated_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="detail-row">
                    <span>보유수량</span>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={vals.quantity ?? ''}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [item.id]: { ...vals, quantity: e.target.value },
                          })
                        }
                        className="inline-input"
                      />
                    ) : (
                      <strong>{formatNumber(item.current_quantity)}</strong>
                    )}
                  </div>
                  <div className="detail-row">
                    <span>평가금액</span>
                    <strong>
                      {item.currency === 'USD' ? (
                        <>
                          {formatCurrency(item.current_value)}
                          <span style={{ marginLeft: '8px', fontSize: '0.9em', color: '#64748b', fontWeight: 'normal' }}>
                            ({formatCurrencyUSD(item.current_quantity * item.latest_price)})
                          </span>
                        </>
                      ) : (
                        formatCurrency(item.current_value)
                      )}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>목표 비중</span>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={vals.targetWeight ?? ''}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [item.id]: { ...vals, targetWeight: e.target.value },
                          })
                        }
                        className="inline-input"
                      />
                    ) : (
                      <strong>{formatNumber(item.target_weight)}%</strong>
                    )}
                  </div>
                  <div className="detail-row">
                    <span>허용오차</span>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={vals.tolerance ?? ''}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            [item.id]: { ...vals, tolerance: e.target.value },
                          })
                        }
                        className="inline-input"
                      />
                    ) : (
                      <strong>±{formatNumber(item.tolerance)}%</strong>
                    )}
                  </div>
                </div>

                {!isEditing && (
                  <div className="rebalance-section">
                    <h4>리밸런싱 제안</h4>
                    {Math.abs(item.rebalance_quantity) < 0.01 ? (
                      <div className="rebalance-none">✓ 적정 범위 내</div>
                    ) : item.rebalance_quantity > 0 ? (
                      <div className="rebalance-buy">
                        📈 <strong>{formatNumber(item.rebalance_quantity)}</strong>주 매수
                        <span className="rebalance-amount">
                          (약 {formatCurrency(item.rebalance_amount)})
                        </span>
                      </div>
                    ) : (
                      <div className="rebalance-sell">
                        📉{' '}
                        <strong>{formatNumber(Math.abs(item.rebalance_quantity))}</strong>
                        주 매도
                        <span className="rebalance-amount">
                          (약 {formatCurrency(Math.abs(item.rebalance_amount))})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {error && <div className="toast error">{error}</div>}
    </div>
  )
}
