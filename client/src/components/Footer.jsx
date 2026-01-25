import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-links">
          <Link to="/privacy">개인정보처리방침</Link>
          <span className="footer-divider">|</span>
          <Link to="/terms">서비스 이용약관</Link>
        </div>
        <p>© 2026 ezport. 포트폴리오 비중 관리의 새로운 기준.</p>
        <p className="footer-contact">문의: <a href="mailto:hwanys2@naver.com">hwanys2@naver.com</a></p>
      </div>
    </footer>
  )
}
