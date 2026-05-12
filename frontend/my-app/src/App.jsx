import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'
import ErrorPage from './pages/ErrorPage'
import './App.css'

const LOGIN_PATH = '/login'

function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    return () => {
      if (session?.pdfUrl) {
        URL.revokeObjectURL(session.pdfUrl)
      }
    }
  }, [session?.pdfUrl])

  const handleLogin = ({ email, apiKey, pdfFile, pdfUrl }) => {
    setSession({ email, apiKey, pdfFile, pdfUrl })
  }

  const isReady = Boolean(session?.email && session?.apiKey && session?.pdfUrl)

  return (
    <BrowserRouter>
      <Routes>
        <Route path={LOGIN_PATH} element={<LoginPage onLogin={handleLogin} />} />
        <Route
          path="/"
          element={
            isReady
              ? <MainPage pdfFilePath={session.pdfUrl} apiKey={session.apiKey} userEmail={session.email} />
              : <Navigate to={LOGIN_PATH} replace />
          }
        />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="*" element={<Navigate to={isReady ? '/' : LOGIN_PATH} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
