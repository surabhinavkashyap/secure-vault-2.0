import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'

function AppRoutes() {
  const [session, setSession] = useState(null)
  const location = useLocation()
  const lockVault = useCallback(() => setSession(null), [])

  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
        <Routes location={location}>
          <Route path="/" element={<Navigate to={session ? '/vault' : '/auth/login'} replace />} />
          <Route path="/auth/:mode" element={session ? <Navigate to="/vault" replace /> : <AuthPage onAuthenticated={setSession} />} />
          <Route path="/vault" element={session ? <DashboardPage session={session} onLock={lockVault} /> : <Navigate to="/auth/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster position="bottom-right" toastOptions={{ duration: 3000, style: { color: '#e4e4e7', background: 'rgba(24,24,27,.96)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '14px', boxShadow: '0 18px 50px rgba(0,0,0,.35)', backdropFilter: 'blur(18px)', fontSize: '12px' }, success: { iconTheme: { primary: '#34d399', secondary: '#111114' } }, error: { iconTheme: { primary: '#f87171', secondary: '#111114' } } }} />
    </BrowserRouter>
  )
}
