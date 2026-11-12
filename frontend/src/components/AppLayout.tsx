import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth';
import Header from './Header'
import Sidebar from './MainSideBar'

export default function AppLayout() {
  const { user, loading } = useAuth()

  if (loading) return null 

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header />
      <div className="d-flex flex-grow-1 position-relative">
        {user && <Sidebar />}
        <main className="flex-grow-1 bg-light p-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}