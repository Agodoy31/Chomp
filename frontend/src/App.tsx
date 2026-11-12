import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import LandingPage from './pages/LandingPage'
import ClubDiscovery from './pages/DiscoveryPage'
import Login from './pages/LoginPage'
import Signup from './pages/SignupPage'
import MessagingPage from './pages/MessagingPage'



export default function App() {
  return (
   <Routes>
  <Route path="/" element={<LandingPage />} />
  <Route path="/login" element={<Login />} />
  <Route path="/signup" element={<Signup />} />

  <Route element={<AppLayout />}>
    <Route path="/clubs" element={<ClubDiscovery />} />
    {/* Uses the discovery page until My Clubs exists */}
    <Route path="/myClubs" element={<ClubDiscovery />} />
    <Route path="/messaging" element={<MessagingPage />} />
  </Route>
</Routes>
  );
}
