import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import useAuthStore from '../store/authStore'
import { getNgrokBypassHeaders, resolveApiBaseUrl } from '../utils/runtimeUrl.js'
import '../styles/VerifyOTP.css'

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL)
const ngrokHeaders = getNgrokBypassHeaders(API_URL)

export default function VerifyOTPPage({ email, onSuccess }) {
  const { loading, error: authError } = useAuth()
  const { setAuth } = useAuthStore()
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(600) // 10 minutes
  const [canResend, setCanResend] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const inputRef = useRef(null)

  // Focus on input when component mounts
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Countdown timer for OTP expiration
  useEffect(() => {
    if (countdown <= 0) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setError('Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdown])

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCountdown <= 0) {
      setCanResend(true)
      return
    }

    const timer = setInterval(() => {
      setResendCountdown((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [resendCountdown])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setOtp(value)
    setError('')
  }

  const handleResendOtp = async () => {
    try {
      setCanResend(false)
      setResendCountdown(60)
      setCountdown(600)
      setError('')

      // Call API to resend OTP
      const response = await fetch(`${API_URL}/auth/send-email-verification-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...ngrokHeaders,
        },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        throw new Error('Failed to resend verification code')
      }

      // Clear OTP input
      setOtp('')
      inputRef.current?.focus()
    } catch (err) {
      setError(err.message || 'Không thể gửi lại mã xác thực')
      setCanResend(true)
      setResendCountdown(0)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!otp || otp.length !== 6) {
      setError('Vui lòng nhập mã xác thực gồm 6 chữ số')
      return
    }

    try {
      setError('')
      const response = await fetch(`${API_URL}/auth/verify-email-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...ngrokHeaders,
        },
        body: JSON.stringify({ email, otp }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Xác thực thất bại')
      }

      const data = await response.json()
      // Save tokens and user info using authStore
      setAuth(data.data.user, data.data.accessToken, data.data.refreshToken)

      // Call onSuccess to trigger auto-login
      onSuccess(data.data)
    } catch (err) {
      setError(err.message || 'Mã xác thực không hợp lệ')
    }
  }

  const displayError = error || authError

  return (
    <div className="verify-otp-container">
      <div className="verify-otp-card">
        <div className="verify-otp-header">
          <h1 className="verify-otp-logo">
            <span className="logo-icon">💬</span>
            <span>TixChat</span>
          </h1>
          <p className="verify-otp-subtitle">Xác thực Email của bạn</p>
        </div>

        <div className="verify-otp-content">
          <p className="verify-otp-email">
            Chúng tôi đã gửi mã xác thực đến <strong>{email}</strong>
          </p>

          <form className="verify-otp-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="otp" className="form-label">
                Nhập mã xác thực (6 chữ số)
              </label>
              <input
                ref={inputRef}
                id="otp"
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={handleChange}
                placeholder="000000"
                maxLength="6"
                className={`otp-input ${displayError ? 'error' : ''}`}
                disabled={loading}
              />
            </div>

            {displayError && (
              <div className="form-error">
                <span className="error-icon">!</span> {displayError}
              </div>
            )}

            <div className="otp-timer">
              <p>
                {countdown > 0 ? (
                  <>
                    <span className="timer-icon">⏰</span>
                    Mã xác thực hết hạn trong <strong>{formatTime(countdown)}</strong>
                  </>
                ) : (
                  <>
                    <span className="timer-icon">❌</span>
                    Mã xác thực đã hết hạn
                  </>
                )}
              </p>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || otp.length !== 6 || countdown <= 0}
            >
              {loading ? 'Đang xác thực...' : 'Xác thực Email'}
            </button>
          </form>

          <div className="resend-section">
            <p>Chưa nhận được mã xác thực?</p>
            <button
              type="button"
              className="btn-resend"
              onClick={handleResendOtp}
              disabled={!canResend || loading}
            >
              {canResend ? (
                'Gửi lại mã xác thực'
              ) : (
                `Gửi lại trong ${resendCountdown} giây`
              )}
            </button>
          </div>
        </div>

        <div className="verify-otp-footer">
          <p className="footer-text">
            Mã xác thực sẽ hết hạn sau 10 phút. Kiểm tra thư mục spam nếu không thấy email.
          </p>
        </div>
      </div>
    </div>
  )
}
