import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav-content">
          <div className="logo-section">
            <img src="/logo.png" alt="Portfolio Tracker" className="landing-logo" />
          </div>
          <div className="nav-actions">
            <Link to="/login" className="nav-link">
              로그인
            </Link>
            <Link to="/login" className="btn-primary">
              시작하기
            </Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            포트폴리오 비중 관리,
            <br />
            이제는 <span className="gradient-text">자동으로</span>
          </h1>
          <p className="hero-subtitle">
            목표 비중을 설정하면 현재 비중과 자동 비교하고,
            <br />
            리밸런싱에 필요한 매수/매도 수량을 정확하게 계산해드립니다.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn-hero">
              무료로 시작하기 →
            </Link>
            <a href="#features" className="btn-outline">
              기능 둘러보기
            </a>
          </div>
        </div>
        <div className="hero-image">
          <div className="demo-card">
            <div className="demo-header">
              <div className="demo-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="demo-title">내 포트폴리오</span>
            </div>
            <div className="demo-content">
              <div className="demo-summary">
                <div className="demo-stat">
                  <span className="demo-label">현재 평가</span>
                  <span className="demo-value">₩12,450,000</span>
                </div>
                <div className="demo-stat">
                  <span className="demo-label">추가 현금</span>
                  <span className="demo-value cash">+₩2,000,000</span>
                </div>
              </div>
              <div className="demo-holding">
                <div className="demo-holding-header">
                  <strong>005930.KS</strong>
                  <span className="demo-badge">삼성전자</span>
                </div>
                <div className="demo-bar">
                  <div className="demo-bar-fill" style={{ width: '35%' }}></div>
                </div>
                <div className="demo-rebalance">
                  <span>📈 15주 매수</span>
                  <span className="demo-amount">₩2,242,500</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="features-content">
          <h2 className="section-title">핵심 기능</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>목표 비중 설정</h3>
              <p>
                종목별로 원하는 비중(%)을 설정하고
                <br />
                허용 오차 범위도 지정할 수 있습니다.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>실시간 비중 비교</h3>
              <p>
                현재 주가를 자동으로 조회하여
                <br />
                목표 vs 현재 비중을 시각화합니다.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💡</div>
              <h3>리밸런싱 제안</h3>
              <p>
                목표 비중 달성을 위해 필요한
                <br />
                정확한 매수/매도 수량을 계산해드립니다.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💰</div>
              <h3>추가 현금 반영</h3>
              <p>
                투자할 추가 현금을 입력하면
                <br />
                그 금액까지 포함해서 계산합니다.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>한글 검색 지원</h3>
              <p>
                "삼성전자", "AAPL" 모두 검색 가능
                <br />
                한국/미국 주식 모두 지원합니다.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>빠른 성능</h3>
              <p>
                가격 캐싱으로 API 호출 최소화
                <br />
                빠르고 안정적인 서비스를 제공합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="cta-content">
          <h2>지금 바로 시작하세요</h2>
          <p>회원가입은 무료이며, 몇 초면 완료됩니다.</p>
          <Link to="/login" className="btn-hero">
            무료로 시작하기 →
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© 2026 Portfolio Rebalancer. 목표 비중 관리의 새로운 기준.</p>
      </footer>
    </div>
  )
}
