import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Button from 'react-bootstrap/Button'
import { ChevronLeft, ChevronRight } from 'react-bootstrap-icons'

interface SidebarProps {
    isLoggedIn?: boolean
}

export default function Sidebar({ isLoggedIn = true }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false)

    if (!isLoggedIn) return null

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
                minHeight: 'calc(100vh - 76px)',
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
            >
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </Button>

            {/* Navigation Text Links */}
            {!collapsed && (
                <nav className="nav flex-column gap-3 p-3 mt-3">
                    {/* My Clubs */}
                    <NavLink
                        to="/myClubs"
                        className={({ isActive }) =>
                            `nav-link text-center fw-bold text-decoration-none ${
                                isActive ? 'shadow-sm' : ''
                            }`
                        }
                        style={({ isActive }) => getLinkStyle(isActive)}
                    >
                        My Clubs
                    </NavLink>

                    {/* All Clubs */}
                    <NavLink
                        to="/clubs"
                        className={({ isActive }) =>
                            `nav-link text-center fw-bold text-decoration-none ${
                                isActive ? 'shadow-sm' : ''
                            }`
                        }
                        style={({ isActive }) => getLinkStyle(isActive)}
                    >
                        All Clubs
                    </NavLink>

                    {/* Messages */}
                    <NavLink
                        to="/messages"
                        className={({ isActive }) =>
                            `nav-link text-center fw-bold text-decoration-none ${
                                isActive ? 'shadow-sm' : ''
                            }`
                        }
                        style={({ isActive }) => getLinkStyle(isActive)}
                    >
                        Messages
                    </NavLink>
                </nav>
            )}
        </div>
    )
}