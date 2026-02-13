import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, getToken } from '../api'
import TopBar from '../components/TopBar'

export default function QueueStatusPage({ user, onLogout }) {
  const [queueStatus, setQueueStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [symbolInput, setSymbolInput] = useState('')
  const [addingSymbol, setAddingSymbol] = useState(false)
  const [addMessage, setAddMessage] = useState('')

  const fetchQueueStatus = async () => {
    try {
      setLoading(true)
      const token = getToken()
      const data = await apiFetch('/api/queue/status', { token })
      console.log('[Queue Status] Received data:', data)
      setQueueStatus(data)
      setError('')
    } catch (err) {
      console.error('[Queue Status] Error:', err)
      setError(err.message || '큐 상태를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueueStatus()
    const interval = setInterval(fetchQueueStatus, 5000) // 5초마다 갱신
    return () => clearInterval(interval)
  }, [])

  const handleAddSymbol = async (e) => {
    e.preventDefault()
    if (!symbolInput.trim()) {
      setAddMessage('종목 코드를 입력해주세요.')
      return
    }

    try {
      setAddingSymbol(true)
      setAddMessage('')
      const token = getToken()
      const data = await apiFetch('/api/queue/add-symbol', {
        token,
        method: 'POST',
        body: { symbol: symbolInput.trim() },
      })
      
      setAddMessage(`✓ ${data.symbol}${data.name_ko ? ` (${data.name_ko})` : ''} 종목이 큐에 추가되었습니다.`)
      setSymbolInput('')
      
      // 큐 상태 새로고침
      setTimeout(() => {
        fetchQueueStatus()
      }, 1000)
    } catch (err) {
      console.error('[Add Symbol] Error:', err)
      setAddMessage(err.message || '종목 추가에 실패했습니다.')
    } finally {
      setAddingSymbol(false)
    }
  }

  const formatTime = (isoString) => {
    if (!isoString) return '-'
    return new Date(isoString).toLocaleString('ko-KR')
  }

  const QueueSection = ({ title, queue }) => {
    if (!queue) return null

    return (
      <div className="queue-section">
        <h2>{title}</h2>
        <div className="queue-stats">
          <div className="stat-box">
            <span className="stat-label">대기 중</span>
            <span className="stat-value waiting">{queue.counts?.waiting || 0}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">처리 중</span>
            <span className="stat-value active">{queue.counts?.active || 0}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">완료</span>
            <span className="stat-value completed">{queue.counts?.completed || 0}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">실패</span>
            <span className="stat-value failed">{queue.counts?.failed || 0}</span>
          </div>
        </div>

        {queue.waiting && queue.waiting.length > 0 && (
          <div className="queue-list">
            <h3>대기 중인 작업 ({queue.waiting.length})</h3>
            <div className="queue-items">
              {queue.waiting.map((job) => (
                <div key={job.id} className="queue-item waiting">
                  <div className="queue-item-main">
                    <span className="queue-item-symbol">{job.symbol || job.code || '환율'}</span>
                    {job.name_ko && <span className="queue-item-name">{job.name_ko}</span>}
                  </div>
                  <span className="queue-item-time">{formatTime(job.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {queue.active && queue.active.length > 0 && (
          <div className="queue-list">
            <h3>처리 중인 작업 ({queue.active.length})</h3>
            <div className="queue-items">
              {queue.active.map((job) => (
                <div key={job.id} className="queue-item active">
                  <div className="queue-item-main">
                    <span className="queue-item-symbol">{job.symbol || job.code || '환율'}</span>
                    {job.name_ko && <span className="queue-item-name">{job.name_ko}</span>}
                  </div>
                  <span className="queue-item-time">{formatTime(job.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {queue.recentCompleted && queue.recentCompleted.length > 0 && (
          <div className="queue-list">
            <h3>최근 완료된 작업 ({queue.recentCompleted.length})</h3>
            <div className="queue-items">
              {queue.recentCompleted.map((job) => (
                <div key={job.id} className="queue-item completed">
                  <div className="queue-item-main">
                    <span className="queue-item-symbol">{job.symbol || job.code || '환율'}</span>
                    {job.name_ko && <span className="queue-item-name">{job.name_ko}</span>}
                  </div>
                  <span className="queue-item-time">{formatTime(job.completed)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {queue.recentFailed && queue.recentFailed.length > 0 && (
          <div className="queue-list">
            <h3>최근 실패한 작업 ({queue.recentFailed.length})</h3>
            <div className="queue-items">
              {queue.recentFailed.map((job) => (
                <div key={job.id} className="queue-item failed">
                  <div className="queue-item-main">
                    <span className="queue-item-symbol">{job.symbol || job.code || '환율'}</span>
                    {job.name_ko && <span className="queue-item-name">{job.name_ko}</span>}
                    {job.error && <span className="queue-item-error">{job.error}</span>}
                  </div>
                  <span className="queue-item-time">{formatTime(job.failed)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <TopBar user={user} onLogout={onLogout} />

      <div className="list-container">
        <div className="list-header">
          <div>
            <h1>큐 상태 확인</h1>
            <p className="subtitle">백그라운드 작업 큐의 상태를 실시간으로 확인합니다</p>
          </div>
          <button onClick={fetchQueueStatus} className="btn-primary" disabled={loading}>
            {loading ? '새로고침 중...' : '새로고침'}
          </button>
        </div>

        <div className="add-symbol-section">
          <h2>신규 종목 추가</h2>
          <p className="subtitle">빠진 종목이나 신규 상장 종목을 추가할 수 있습니다</p>
          <form onSubmit={handleAddSymbol} className="add-symbol-form">
            <div className="form-group">
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                placeholder="종목 코드 입력 (예: 005930, AAPL, 005930.KS)"
                className="form-input"
                disabled={addingSymbol}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={addingSymbol || !symbolInput.trim()}
              >
                {addingSymbol ? '추가 중...' : '종목 추가'}
              </button>
            </div>
            {addMessage && (
              <div className={`toast ${addMessage.startsWith('✓') ? 'success' : 'error'}`}>
                {addMessage}
              </div>
            )}
          </form>
        </div>

        {error && <div className="toast error">{error}</div>}

        {loading && !queueStatus ? (
          <div className="loading-state">로딩 중...</div>
        ) : queueStatus ? (
          <div className="queue-container">
            <QueueSection title="가격 업데이트 큐" queue={queueStatus.priceUpdate} />
            <QueueSection title="종목 등록 큐" queue={queueStatus.seed} />
            <QueueSection title="환율 업데이트 큐" queue={queueStatus.exchangeRate} />
          </div>
        ) : (
          <div className="empty-state">큐 상태를 불러올 수 없습니다</div>
        )}
      </div>
    </div>
  )
}
