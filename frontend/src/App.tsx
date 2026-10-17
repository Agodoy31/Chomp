import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ClubDiscovery from './pages/DiscoveryPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/clubs" element={<ClubDiscovery />} />
    </Routes>
  )
}
