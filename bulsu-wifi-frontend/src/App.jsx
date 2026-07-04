import { Route, Routes, Navigate } from 'react-router-dom'
import LoginPage from './components/LoginPage'
import GuestVerify from './components/GuestVerify'
import SessionDashboard from './components/Sessiondashboard'
import AdminLogin from './components/admin/AdminLogin'
import AdminLayout from './components/admin/AdminLayout'
import ProtectedRoute from './components/admin/ProtectedRoute'
import AdminOverview from './components/admin/AdminOverview'
import AdminUsers from './components/admin/AdminUsers'
import AdminSessions from './components/admin/AdminSessions'
import AdminGuests from './components/admin/AdminGuests'
import AdminEmergency from './components/admin/AdminEmergency'
import AdminFeedback from './components/admin/AdminFeedback'
import AdminNotifications from './components/admin/AdminNotifications'
import AdminSettings from './components/admin/AdminSettings'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/guest" element={<GuestVerify />} />
      <Route path="/dashboard" element={<SessionDashboard />} />
      <Route path="/admin/login" element={<Navigate to="/" replace />} />
      <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="sessions" element={<AdminSessions />} />
        <Route path="guests" element={<AdminGuests />} />
        <Route path="emergency" element={<AdminEmergency />} />
        <Route path="feedback" element={<AdminFeedback />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
    </Routes>
  )
}

export default App
