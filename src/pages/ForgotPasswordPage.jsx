import { useState } from 'react'
import { authService } from '../services/api'

const isValidEmail = (value = '') =>
  /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value)

/**
 * ForgotPasswordPage - Luồng đặt lại mật khẩu
 * Bước 1: Nhập email
 * Bước 2: Nhập mã xác minh (OTP)
 * Bước 3: Đặt lại mật khẩu
 */
export default function ForgotPasswordPage({ onSwitchToLogin, onSuccess }) {
  const [step, setStep] = useState(1) // 1: email, 2: verify, 3: reset
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Step 1: Request password reset
  const handleRequestReset = async (e) => {
    e.preventDefault()
    const newErrors = {}
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      newErrors.email = 'Email là bắt buộc'
    } else if (!isValidEmail(normalizedEmail)) {
      newErrors.email = 'Vui lòng nhập email hợp lệ'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    setErrors({})
    setMessage('')

    try {
      await authService.forgotPassword(normalizedEmail)
      setEmail(normalizedEmail)
      setMessage('Mã xác minh đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư đến.')
      setStep(2)
    } catch (err) {
      setErrors({ submit: err.response?.data?.error || 'Không thể gửi email đặt lại' })
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify token
  const handleVerifyToken = async (e) => {
    e.preventDefault()
    const newErrors = {}
    const normalizedEmail = email.trim()
    const normalizedToken = token.trim().toUpperCase()

    if (!normalizedToken) {
      newErrors.token = 'Mã xác minh là bắt buộc'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    setErrors({})
    setMessage('')

    try {
      await authService.verifyResetToken(normalizedEmail, normalizedToken)
      setEmail(normalizedEmail)
      setToken(normalizedToken)
      setStep(3)
      setMessage('Xác minh thành công. Vui lòng nhập mật khẩu mới của bạn.')
    } catch (err) {
      setErrors({ submit: err.response?.data?.error || 'Mã xác minh không hợp lệ hoặc đã hết hạn' })
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Reset password
  const handleResetPassword = async (e) => {
    e.preventDefault()
    const newErrors = {}
    const normalizedEmail = email.trim()
    const normalizedToken = token.trim().toUpperCase()

    if (!newPassword) {
      newErrors.newPassword = 'Mật khẩu mới là bắt buộc'
    } else if (newPassword.length < 6) {
      newErrors.newPassword = 'Mật khẩu phải có ít nhất 6 ký tự'
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu'
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu không khớp'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    setErrors({})
    setMessage('')

    try {
      await authService.resetPassword(normalizedEmail, normalizedToken, newPassword, confirmPassword)
      setMessage('Đặt lại mật khẩu thành công! Đang chuyển hướng đến đăng nhập...')
      setTimeout(() => {
        onSuccess()
      }, 2000)
    } catch (err) {
      setErrors({ submit: err.response?.data?.error || 'Không thể đặt lại mật khẩu' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form-header">
        <h1 className="auth-logo">
          <span className="logo-icon">💬</span>
          <span>TixChat</span>
        </h1>
        <p className="auth-subtitle">Đặt lại mật khẩu của bạn</p>
      </div>

      {/* Progress Steps */}
      <div className="progress-steps">
        <div className={`step ${step >= 1 ? 'active' : ''}`}>
          <span className="step-number">1</span>
          <span className="step-label">Email</span>
        </div>
        <div className={`step-connector ${step > 1 ? 'active' : ''}`} />
        <div className={`step ${step >= 2 ? 'active' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">Xác minh</span>
        </div>
        <div className={`step-connector ${step > 2 ? 'active' : ''}`} />
        <div className={`step ${step >= 3 ? 'active' : ''}`}>
          <span className="step-number">3</span>
          <span className="step-label">Đặt lại</span>
        </div>
      </div>

      <form className="auth-form" noValidate data-testid="forgot-password-form" onSubmit={
        step === 1 ? handleRequestReset : step === 2 ? handleVerifyToken : handleResetPassword
      }>
        {/* Step 1: Email */}
        {step === 1 && (
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              <span className="label-text">Địa chỉ Email</span>
              {email && <span className="label-status">✓</span>}
            </label>
            <div className="form-input-wrapper">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (errors.email) {
                    setErrors({ ...errors, email: '' })
                  }
                }}
                placeholder="youremail@example.com"
                className={`form-input ${errors.email ? 'input-error' : ''}`}
                disabled={loading}
                autoComplete="email"
                data-testid="forgot-email"
              />
            </div>
            {errors.email && <span className="form-error">{errors.email}</span>}
            <p className="form-hint">Chúng tôi sẽ gửi mã xác minh đến email này</p>
          </div>
        )}

        {/* Step 2: Verification Code */}
        {step === 2 && (
          <>
            <div className="form-group">
              <label htmlFor="token" className="form-label">
                <span className="label-text">Mã xác minh</span>
                {token && <span className="label-status">✓</span>}
              </label>
              <div className="form-input-wrapper">
                <input
                  id="token"
                  type="text"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value.toUpperCase())
                    if (errors.token) {
                      setErrors({ ...errors, token: '' })
                    }
                  }}
                  placeholder="Nhập mã 6 chữ số"
                  className={`form-input code-input ${errors.token ? 'input-error' : ''}`}
                  disabled={loading}
                  maxLength="6"
                  data-testid="forgot-token"
                />
              </div>
              {errors.token && <span className="form-error">{errors.token}</span>}
              <p className="form-hint">Kiểm tra email của bạn để tìm mã xác minh</p>
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="form-link"
              disabled={loading}
            >
              Quay lại email
            </button>
          </>
        )}

        {/* Step 3: New Password */}
        {step === 3 && (
          <>
            <div className="form-group">
              <label htmlFor="newPassword" className="form-label">
                <span className="label-text">Mật khẩu mới</span>
                {newPassword && <span className="label-status">✓</span>}
              </label>
              <div className="form-input-wrapper">
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    if (errors.newPassword) {
                      setErrors({ ...errors, newPassword: '' })
                    }
                  }}
                  placeholder="••••••••"
                  className={`form-input ${errors.newPassword ? 'input-error' : ''}`}
                  disabled={loading}
                  autoComplete="new-password"
                  data-testid="forgot-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="form-icon-btn"
                  disabled={loading}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {errors.newPassword && <span className="form-error">{errors.newPassword}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">
                <span className="label-text">Xác nhận mật khẩu</span>
                {confirmPassword && <span className="label-status">✓</span>}
              </label>
              <div className="form-input-wrapper">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    if (errors.confirmPassword) {
                      setErrors({ ...errors, confirmPassword: '' })
                    }
                  }}
                  placeholder="••••••••"
                  className={`form-input ${errors.confirmPassword ? 'input-error' : ''}`}
                  disabled={loading}
                  autoComplete="new-password"
                  data-testid="forgot-confirm-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="form-icon-btn"
                  disabled={loading}
                  title={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {errors.confirmPassword && <span className="form-error">{errors.confirmPassword}</span>}
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="form-link"
              disabled={loading}
            >
              Quay lại xác minh
            </button>
          </>
        )}

        {/* Messages */}
        {errors.submit && (
          <div className="form-alert alert-error">
            <span className="alert-icon">!</span>
            <span className="alert-text">{errors.submit}</span>
          </div>
        )}

        {message && (
          <div className="form-alert alert-success">
            <span className="alert-icon">✓</span>
            <span className="alert-text">{message}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          className="form-button button-primary"
          disabled={loading}
          data-testid="forgot-submit"
        >
          {loading ? (
            <>
              <span className="button-spinner" />
              <span>
                {step === 1 ? 'Đang gửi mã...' : step === 2 ? 'Đang xác minh...' : 'Đang đặt lại...'}
              </span>
            </>
          ) : (
            <>
              <span>
                {step === 1 ? 'Gửi mã' : step === 2 ? 'Xác minh mã' : 'Đặt lại mật khẩu'}
              </span>
              
            </>
          )}
        </button>

        {/* Back to Login */}
        <div className="form-footer">
          <p className="form-footer-text">
            Nhớ mật khẩu của bạn?{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="form-link form-link-strong"
              disabled={loading}
            >
              Đăng nhập
            </button>
          </p>
        </div>
      </form>
    </div>
  )
}
