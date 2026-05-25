import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function RegisterPage({ onSwitchToLogin, onSuccess }) {
  const { register, loading, error: authError } = useAuth()
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const validateUsername = (username) => {
    if (!username) return 'Tên người dùng là bắt buộc'
    if (username.length < 3) return 'Tên người dùng phải có ít nhất 3 ký tự'
    if (username.length > 30) return 'Tên người dùng phải có tối đa 30 ký tự'
    if (!/^[a-zA-Z0-9]*$/.test(username)) return 'Tên người dùng chỉ có thể chứa chữ cái và số'
    return ''
  }

  const validateEmail = (email) => {
    if (!email) return 'Email là bắt buộc'
    if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return 'Vui lòng nhập email hợp lệ'
    }
    return ''
  }

  const validateFullName = (fullName) => {
    if (!fullName) return 'Tên đầy đủ là bắt buộc'
    if (fullName.length < 2) return 'Tên đầy đủ phải có ít nhất 2 ký tự'
    if (fullName.length > 100) return 'Tên đầy đủ phải có tối đa 100 ký tự'
    return ''
  }

  const validatePassword = (password) => {
    if (!password) return 'Mật khẩu là bắt buộc'
    if (password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự'
    return ''
  }

  const validateConfirmPassword = (password, confirmPassword) => {
    if (!confirmPassword) return 'Vui lòng xác nhận mật khẩu'
    if (password !== confirmPassword) return 'Mật khẩu không khớp'
    return ''
  }

  const getPasswordStrength = (password) => {
    if (!password) return { level: 0, label: '', class: '' }
    
    let strength = 0
    if (password.length >= 6) strength++
    if (password.length >= 8) strength++
    if (/[A-Z]/.test(password)) strength++
    if (/[0-9]/.test(password)) strength++
    if (/[!@#$%^&*]/.test(password)) strength++

    const levels = [
      { level: 0, label: '', class: '' },
      { level: 1, label: 'Yếu', class: 'strength-weak' },
      { level: 2, label: 'Tạm', class: 'strength-fair' },
      { level: 3, label: 'Tốt', class: 'strength-good' },
      { level: 4, label: 'Mạnh', class: 'strength-strong' },
      { level: 5, label: 'Rất Mạnh', class: 'strength-very-strong' },
    ]

    return levels[strength]
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Real-time validation
    const newErrors = { ...errors }
    switch (name) {
      case 'username':
        newErrors.username = validateUsername(value)
        break
      case 'email':
        newErrors.email = validateEmail(value)
        break
      case 'fullName':
        newErrors.fullName = validateFullName(value)
        break
      case 'password':
        newErrors.password = validatePassword(value)
        if (formData.confirmPassword) {
          newErrors.confirmPassword = validateConfirmPassword(value, formData.confirmPassword)
        }
        break
      case 'confirmPassword':
        newErrors.confirmPassword = validateConfirmPassword(formData.password, value)
        break
      default:
        break
    }
    setErrors(newErrors)
  }

  const validateForm = () => {
    const newErrors = {
      username: validateUsername(formData.username),
      email: validateEmail(formData.email),
      fullName: validateFullName(formData.fullName),
      password: validatePassword(formData.password),
      confirmPassword: validateConfirmPassword(formData.password, formData.confirmPassword),
    }

    setErrors(newErrors)
    return Object.values(newErrors).every((err) => !err)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      const result = await register(formData)
      // Pass userData including email to onSuccess
      // Result from API is { message, user } so we pass the user data
      onSuccess(result.user || result)
    } catch (err) {
      // Error handled by useAuth hook
    }
  }

  const passwordStrength = getPasswordStrength(formData.password)

  return (
    <div className="auth-form-container">
      <div className="auth-form-header">
        <h1 className="auth-logo">
          <span className="logo-icon">Chat</span>
          <span>TixChat</span>
        </h1>
        <p className="auth-subtitle">Tham gia TixChat ngay hôm nay</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {/* Username Field */}
        <div className="form-group">
          <label htmlFor="username" className="form-label">
            <span className="label-text">Tên người dùng</span>
            {!errors.username && formData.username && <span className="label-status">✓</span>}
          </label>
          <div className="form-input-wrapper">
            <input
              id="username"
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="john_doe"
              className={`form-input ${errors.username ? 'input-error' : ''}`}
              disabled={loading}
              autoComplete="username"
            />
          </div>
          {errors.username && <span className="form-error">{errors.username}</span>}
        </div>

        {/* Email Field */}
        <div className="form-group">
          <label htmlFor="email" className="form-label">
            <span className="label-text">Địa chỉ Email</span>
            {!errors.email && formData.email && <span className="label-status">✓</span>}
          </label>
          <div className="form-input-wrapper">
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="youremail@example.com"
              className={`form-input ${errors.email ? 'input-error' : ''}`}
              disabled={loading}
              autoComplete="email"
            />
          </div>
          {errors.email && <span className="form-error">{errors.email}</span>}
        </div>

        {/* Full Name Field */}
        <div className="form-group">
          <label htmlFor="fullName" className="form-label">
            <span className="label-text">Tên đầy đủ</span>
            {!errors.fullName && formData.fullName && <span className="label-status">✓</span>}
          </label>
          <div className="form-input-wrapper">
            <input
              id="fullName"
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="John Doe"
              className={`form-input ${errors.fullName ? 'input-error' : ''}`}
              disabled={loading}
              autoComplete="name"
            />
          </div>
          {errors.fullName && <span className="form-error">{errors.fullName}</span>}
        </div>

        {/* Password Field */}
        <div className="form-group">
          <label htmlFor="password" className="form-label">
            <span className="label-text">Mật khẩu</span>
            {!errors.password && formData.password && <span className="label-status">✓</span>}
          </label>
          <div className="form-input-wrapper">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className={`form-input ${errors.password ? 'input-error' : ''}`}
              disabled={loading}
              autoComplete="new-password"
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
          {formData.password && (
            <div className={`password-strength ${passwordStrength.class}`}>
              <div className="strength-bar">
                <div className="strength-fill" style={{ width: `${(passwordStrength.level / 5) * 100}%` }} />
              </div>
              <span className="strength-label">{passwordStrength.label}</span>
            </div>
          )}
        </div>

        {/* Confirm Password Field */}
        <div className="form-group">
          <label htmlFor="confirmPassword" className="form-label">
            <span className="label-text">Xác nhận mật khẩu</span>
            {!errors.confirmPassword && formData.confirmPassword && <span className="label-status">✓</span>}
          </label>
          <div className="form-input-wrapper">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="••••••••"
              className={`form-input ${errors.confirmPassword ? 'input-error' : ''}`}
              disabled={loading}
              autoComplete="new-password"
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

        {/* Auth Error Message */}
        {authError && (
          <div className="form-alert alert-error">
            <span className="alert-icon">!</span>
            <span className="alert-text">{authError}</span>
          </div>
        )}

        {/* Submit Button */}
        <button type="submit" className="form-button button-primary" disabled={loading}>
          {loading ? (
            <>
              <span className="button-spinner" />
              <span>Đang tạo tài khoản...</span>
            </>
          ) : (
            <>
              <span>Tạo tài khoản</span>
              
            </>
          )}
        </button>

        {/* Login Link */}
        <div className="form-footer">
          <p className="form-footer-text">
            Đã có tài khoản?{' '}
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
