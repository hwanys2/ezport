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

  // Add item state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItem, setNewItem] = useState(emptyItem())

  const token = getToken()

  const fetchPortfolio = async () => {
    try {
      const data = await apiFetch(`/api/portfolios/${id}`, { token })
      setPortfolio(data)
      setAdditionalCash(data.additional_cash ?? 0)
      setIsPublic(data.is_public === 1)
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
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/portfolios/${id}/items`, {
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
      setNewItem((prev) => ({
        ...prev,
        searchResults: data.items || [],
        searchWarning: data.warning || '',
      }))
    } catch {
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

  return (
    <div className="page">
      <TopBar user={user} onLogout={onLogout} />

      <div className="detail-container">
        <div className="detail-header-bar">
          <button className="back-button" onClick={() => navigate('/portfolios')}>
            ← 목록
          </button>
          <h1>{portfolio.name}</h1>
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
                  {newItem.searchWarning && (
                    <div className="warning-text">{newItem.searchWarning}</div>
                  )}
                  {newItem.searchResults.length > 0 && (
                    <div className="search-results">
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
                  )}
                </div>
                <div className="form-group">
                  <label>티커</label>
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
