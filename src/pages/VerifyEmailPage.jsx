import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import './VerifyEmailPage.css'

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/$/, '')
const API_URL = normalizeBaseUrl(import.meta.env.VITE_API_URL || 'http://localhost:5000/api')

export default function VerifyEmailPage() {
  const [status, setStatus] = useState('verifying') // verifying, success, error
  const [message, setMessage] = useState('')
  const [countdown, setCountdown] = useState(3)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const token = searchParams.get('token')

        if (!token) {
          setStatus('error')
          setMessage('❌ Liên kết xác minh không hợp lệ. Không có token được cung cấp.')
          return
        }

        const response = await axios.get(`${API_URL}/email/verify/${token}`)

        if (response.status === 200) {
          setStatus('success')
          setMessage('✨ ' + response.data.message)

          // Start countdown and redirect
          const interval = setInterval(() => {
            setCountdown(prev => {
              if (prev <= 1) {
                clearInterval(interval)
                navigate('/auth/login')
                return 0
              }
              return prev - 1
            })
          }, 1000)

          return () => clearInterval(interval)
        }
      } catch (error) {
        setStatus('error')
        const errorMessage =
          error.response?.data?.error || error.message || 'Xác minh email thất bại'
        setMessage('❌ ' + errorMessage)
      }
    }

    verifyEmail()
  }, [searchParams, navigate])

  return (
    <div className="verify-email-container">
      <div className="verify-card">
        {status === 'verifying' && (
          <>
            <div className="spinner"></div>
            <h2>Đang xác minh Email của bạn...</h2>
            <p>Vui lòng chờ trong khi chúng tôi xác minh địa chỉ email của bạn. Điều này có thể mất vài giây.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="success-icon">✅</div>
            <h2>Email được xác minh thành công!</h2>
            <p>{message}</p>
            <p className="countdown">
              Đang chuyển hướng đến đăng nhập trong <strong>{countdown}</strong> giây...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="error-icon">❌</div>
            <h2>Xác minh thất bại</h2>
            <p className="error-message">{message}</p>

            <div className="error-actions">
              <button onClick={() => navigate('/auth/register')} className="btn-primary">
                ← Quay lại Đăng ký
              </button>
              <button onClick={() => navigate('/auth/login')} className="btn-secondary">
                Đi đến Đăng nhập
              </button>
            </div>

            <div className="error-help">
              <h4>Cần giúp đỡ?</h4>
              <p>
                Nếu bạn gặp sự cố khi xác minh email:
              </p>
              <ul>
                <li>Kiểm tra liên kết có đầy đủ và chính xác</li>
                <li>Liên kết xác minh hết hạn sau 24 giờ</li>
                <li>Hãy thử đăng ký lại để nhận liên kết xác minh mới</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
