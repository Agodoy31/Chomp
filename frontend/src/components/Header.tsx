import { Link, useNavigate } from 'react-router-dom';
import Button from 'react-bootstrap/Button';

export default function Header() {
  const navigate = useNavigate();

  // TODO: once auth is merged, have log out button instead of Login / Sign Up for logged-in users.

  return (
    <header className="w-100 bg-white border-bottom sticky-top shadow-sm">
      {/* 3 columns: left and right are equal, so the logo is always centered */}
      <div
        className="container-fluid px-3 px-sm-4 py-3 d-grid align-items-center"
        style={{ gridTemplateColumns: '1fr auto 1fr' }}
      >
        {/* Left */}
        <div
          className="bg-primary-subtle rounded-3 d-flex align-items-center justify-content-center p-2 shadow-sm"
          style={{ width: '48px', height: '48px' }}
        >
          <img
            src="/UF_Monogram.svg"
            alt="UF Monogram Logo"
            style={{ height: '24px', width: '24px', objectFit: 'contain' }}
          />
        </div>

        {/* Center */}
        <Link
          to="/"
          className="fw-bold"
          style={{
            color: '#3046C3',
            fontFamily: 'Irish Grover',
            fontStyle: 'italic',
            fontSize: 'clamp(24px, 6vw, 50px)',
            whiteSpace: 'nowrap',
            padding: 15,
            textDecoration: 'none',
          }}
        >
          Chomp!
        </Link>

        {/* Right */}
        <div className="d-flex justify-content-end gap-1 gap-sm-2">
          <Button
            size="sm"
            variant="outline-primary"
            onClick={() => navigate('/login')}
          >
            Login
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate('/signup')}
          >
            Sign Up
          </Button>
        </div>
      </div>
    </header>
  );
}
