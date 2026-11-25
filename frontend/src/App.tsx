import { Route, Routes, useNavigate, useParams } from 'react-router-dom'
import MyClubs from './pages/MyClubsPage'
import AppLayout from './components/AppLayout'
import LandingPage from './pages/LandingPage'
import ClubDiscovery from './pages/DiscoveryPage'
import Login from './pages/LoginPage'
import Signup from './pages/SignupPage'
import MessagingPage from './pages/MessagingPage'
import ClubInfoModal from './components/modals/ClubInfoModal'

// shortcut: temporary preview route, remove when a club page owns ClubInfoModal
function ClubInfoRoute() {
  const { clubId } = useParams()
  const navigate = useNavigate()
  return <ClubInfoModal show clubId={clubId ?? null} onHide={() => navigate('/myClubs')} />
}

export default function App() {
  return (
   <Routes>
  <Route path="/" element={<LandingPage />} />
  <Route path="/login" element={<Login />} />
  <Route path="/signup" element={<Signup />} />

  <Route element={<AppLayout />}>
    <Route path="/clubs" element={<ClubDiscovery />} />
    <Route path="/myClubs" element={<MyClubs />} />
    <Route path="/messaging" element={<MessagingPage />} />
    <Route path="/club/:clubId" element={<ClubInfoRoute />} />
  </Route>
</Routes>
  );
}
