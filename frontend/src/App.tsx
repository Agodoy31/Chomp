import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ClubDiscovery from './pages/DiscoveryPage'
import Login from './pages/LoginPage'
import Signup from './pages/SignupPage'
import MessagingPage from './pages/MessagingPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/clubs" element={<ClubDiscovery />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/messaging" element={<MessagingPage />} />
    </Routes>
  );
}
