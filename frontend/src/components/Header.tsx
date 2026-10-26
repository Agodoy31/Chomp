import { Link, useNavigate } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import { useAuth } from '../hooks/useAuth';

type HeaderProps ={
    showAuthButtons?: boolean
  }

export default function Header({showAuthButtons = true}: HeaderProps) {
  const navigate = useNavigate()
  const { user, loading, logout } = useAuth()

  const initials = user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : ''

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <header className="w-100 border-bottom sticky-top shadow-sm" 
      style={{
        background:"#3046C3"
      }}
    >
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
            color: 'white',
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
        <div className="d-flex justify-content-end align-items-center gap-1 gap-sm-2">

          {!loading && user && (
            <>
            <Button 
             size="sm"
             className="fw-normal px-3 text-white border-0"
             style={{ backgroundColor: '#F07833' }}
             onClick = {handleLogout}
            >
             Log out
            </Button>

            {/* Circle with users initial*/}
            <div className= "d-flex align-items-center justify-content-center rounded-circle fw-semibold"
              
              style ={{
                width: 40,
                height: 40,
                backgroundColor: '#D9D9D9',
                border: '1px solid #14246D',
                color: '#14246d'

              }}
            >
              {initials}
            </div>
            </>
          )}

          {!loading && !user && showAuthButtons && (
            <>
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => navigate('/login')}
              >
                Login
              </Button>
              <Button
                size="sm"
                className="fw-normal px-3 text-white border-0"
                style={{ backgroundColor: '#F07833' }}
                onClick={() => navigate('/signup')}
              >
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}