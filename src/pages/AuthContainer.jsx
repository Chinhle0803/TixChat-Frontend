import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import ForgotPasswordPage from './ForgotPasswordPage'
import VerifyOTPPage from './VerifyOTPPage'
import '../styles/Auth.css'

/**
 * AuthContainer - Manages authentication flow
 * Switches between Login, Register, Forgot Password, and OTP Verification pages
 */
export default function AuthContainer() {
  const navigate = useNavigate()
  const [currentPage, setCurrentPage] = useState('login') // 'login' | 'register' | 'forgot' | 'verify-otp'
  const [verifyEmail, setVerifyEmail] = useState(null) // Email for OTP verification

  const handleSwitchPage = (page, email = null) => {
    setCurrentPage(page)
    if (email) {
      setVerifyEmail(email)
    }
  }

  const handleLoginSuccess = () => {
    navigate('/chat')
  }

  const handleRegisterSuccess = (userData) => {
    // After successful registration, redirect to OTP verification
    handleSwitchPage('verify-otp', userData.email)
  }

  const handleOtpSuccess = () => {
    // After successful OTP verification, auto-login
    navigate('/chat')
  }

  const handleForgotPasswordSuccess = () => {
    setCurrentPage('login')
  }

  return (
    <div className="auth-container">
      <div className="auth-background" />
      
      <div className="auth-wrapper">
        <div className="auth-content">
          {currentPage === 'login' && (
            <LoginPage
              onSwitchToRegister={() => handleSwitchPage('register')}
              onSwitchToForgot={() => handleSwitchPage('forgot')}
              onSuccess={handleLoginSuccess}
            />
          )}

          {currentPage === 'register' && (
            <RegisterPage
              onSwitchToLogin={() => handleSwitchPage('login')}
              onSuccess={handleRegisterSuccess}
            />
          )}

          {currentPage === 'forgot' && (
            <ForgotPasswordPage
              onSwitchToLogin={() => handleSwitchPage('login')}
              onSuccess={handleForgotPasswordSuccess}
            />
          )}

          {currentPage === 'verify-otp' && verifyEmail && (
            <VerifyOTPPage
              email={verifyEmail}
              onSuccess={handleOtpSuccess}
            />
          )}
        </div>

        {/* Decorative elements */}
        <div className="auth-decoration auth-decoration-1" />
        <div className="auth-decoration auth-decoration-2" />
        <div className="auth-decoration auth-decoration-3" />
      </div>
    </div>
  )
}
