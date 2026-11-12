import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Button from 'react-bootstrap/Button'
import { ChevronLeft, ChevronRight } from 'react-bootstrap-icons'


const NAV_ITEMS = [
  { to: '/clubs', label: 'Discover Clubs' },
  { to: '/myClubs', label: 'My Clubs' },
  { to: '/messaging', label: 'Messaging' },
];

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false)


    const getLinkStyle = (isActive: boolean) => ({
        backgroundColor: isActive ? '#ffffff' : 'transparent',
        color: isActive ? '#3046C3' : '#ffffff',
        borderRadius: '12px',
        padding: '10px 14px',
        fontSize: '1.1rem',
        fontFamily: '"Irish Grover"',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
    })

    return (
        <div
            className="d-flex flex-column text-white position-relative"
            style={{
                width: collapsed ? '36px' : '200px',
                backgroundColor: '#3046C3',
                transition: 'width 0.25s ease-in-out',
                zIndex: 100,
            }}
        >
            {/* Centered Vertically Toggle Button*/}
            <Button
                variant="light"
                onClick={() => setCollapsed(!collapsed)}
                className="rounded-circle position-absolute border shadow-sm p-0 d-flex align-items-center justify-content-center"
                style={{
                    top: '50%',
                    right: '-14px',
                    transform: 'translateY(-50%)',
                    width: '28px',
                    height: '28px',
                    zIndex: 101,
                    color: '#3046C3',
                }}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                aria-controls="main-nav"
            >
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </Button>

            {/* Navigation Text Links */}
            {!collapsed && (
                <nav className="nav flex-column gap-3 p-3 mt-3" id="main-nav" aria-label="Main">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `nav-link text-center fw-bold text-decoration-none ${
                                    isActive ? 'shadow-sm' : ''
                                }`
                            }
                            style={({ isActive }) => getLinkStyle(isActive)}
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            )}
        </div>
    )
}