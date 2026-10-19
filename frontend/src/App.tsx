import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ClubDiscovery from './pages/DiscoveryPage'
import Login from './pages/LoginPage'
<<<<<<< HEAD
import Signup from './pages/SignupPage'
=======
>>>>>>> 652e7eb (Created Login page with a component layout (for login and sign up pages)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/clubs" element={<ClubDiscovery />} />
      <Route path="/login" element={<Login />} />
<<<<<<< HEAD
      <Route path="/signup" element={<Signup />} />
=======
>>>>>>> 652e7eb (Created Login page with a component layout (for login and sign up pages)
    </Routes>
  )
}
