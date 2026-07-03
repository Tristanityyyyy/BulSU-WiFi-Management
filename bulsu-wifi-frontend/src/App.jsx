import { Route, Routes } from 'react-router-dom'
import LoginPage from './components/LoginPage'
import GuestVerify from './components/GuestVerify'
import SessionDashboard from './components/Sessiondashboard'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/guest" element={<GuestVerify />} />
      <Route path="/dashboard" element={<SessionDashboard />} />
    </Routes>
  )
}

export default App
