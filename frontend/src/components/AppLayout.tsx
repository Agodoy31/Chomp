import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth';
import Header from './Header'
import Sidebar from './MainSideBar'

export default function AppLayout() {
  const { user, loading } = useAuth()

  if (loading) return null 

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      <Header />
      <div className="d-flex flex-grow-1 position-relative overflow-hidden" style={{ minHeight: 0 }}>
        {user && <Sidebar />}
        <main className="flex-grow-1 bg-light p-0 overflow-auto" style={{ minWidth: 0, minHeight: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}