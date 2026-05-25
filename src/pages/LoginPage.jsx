import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

/**
 * LoginPage - Giao diện đăng nhập người dùng
 * Tính năng:
 * - Nhập email và mật khẩu
 * - Xác thực biểu mẫu
 * - Trạng thái tải
 * - Thông báo lỗi
 * - Chuyển đến đăng ký/quên mật khẩu
 */
export default function LoginPage({ onSwitchToRegister, onSwitchToForgot, onSuccess }) {
  const { login, loading, error: authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)

  const validateForm = () => {
    const newErrors = {}

    if (!email.trim()) {
      newErrors.email = 'Email là bắt buộc'
    } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      newErrors.email = 'Vui lòng nhập email hợp lệ'
    }

    if (!password) {
      newErrors.password = 'Mật khẩu là bắt buộc'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      await login(email, password)
      onSuccess()
    } catch (err) {
      // Error handled by useAuth hook
    }
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form-header">
        <h1 className="auth-logo">
          <span className="logo-icon">💬</span>
          <span>TixChat</span>
        </h1>
        <p className="auth-subtitle">Chào mừng bạn quay trở lại TixChat</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {/* Email Field */}
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
            />
          </div>
          {errors.email && <span className="form-error">{errors.email}</span>}
        </div>

        {/* Password Field */}
        <div className="form-group">
          <label htmlFor="password" className="form-label">
            <span className="label-text">Mật khẩu</span>
            {password && <span className="label-status">✓</span>}
          </label>
          <div className="form-input-wrapper">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) {
                  setErrors({ ...errors, password: '' })
                }
              }}
              placeholder="••••••••"
              className={`form-input ${errors.password ? 'input-error' : ''}`}
              disabled={loading}
              autoComplete="current-password"
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
          {errors.password && <span className="form-error">{errors.password}</span>}
        </div>

        {/* Auth Error Message */}
        {authError && (
          <div className="form-alert alert-error">
            <span className="alert-icon">!</span>
            <span className="alert-text">{authError}</span>
          </div>
        )}

        {/* Forgot Password Link */}
        <button
          type="button"
          onClick={onSwitchToForgot}
          className="form-link"
          disabled={loading}
        >
          Quên mật khẩu?
        </button>

        {/* Submit Button */}
        <button type="submit" className="form-button button-primary" disabled={loading}>
          {loading ? (
            <>
              <span className="button-spinner" />
              <span>Đang đăng nhập...</span>
            </>
          ) : (
            <>
              <span>Đăng nhập</span>
              
            </>
          )}
        </button>

        {/* Register Link */}
        <div className="form-footer">
          <p className="form-footer-text">
            Chưa có tài khoản?{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="form-link form-link-strong"
              disabled={loading}
            >
              Tạo tài khoản
            </button>
          </p>
        </div>
      </form>
    </div>
  )
}
