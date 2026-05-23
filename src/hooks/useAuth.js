import { useState, useCallback } from 'react'
import { authService, userService } from '../services/api'
import useAuthStore from '../store/authStore'

export const useAuth = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { setAuth, logout: logoutStore, updateUser, user } = useAuthStore()

  const register = useCallback(
    async (userData) => {
      setLoading(true)
      setError(null)
      try {
        const response = await authService.register(userData)
        return response.data
      } catch (err) {
        const errorMsg = err.response?.data?.error || 'Registration failed'
        setError(errorMsg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const login = useCallback(
    async (email, password) => {
      setLoading(true)
      setError(null)
      try {
        const response = await authService.login(email, password)
        const { user, accessToken, refreshToken } = response.data.data
        setAuth(user, accessToken, refreshToken)
        return response.data
      } catch (err) {
        let errorMsg = err.response?.data?.error || err.response?.data?.message || 'Login failed'
        
        // Translate login errors to Vietnamese
        const errorMap = {
          'incorrect password': 'Mật khẩu không chính xác',
          'wrong password': 'Mật khẩu không chính xác',
          'password is incorrect': 'Mật khẩu không chính xác',
          'user not found': 'Tài khoản không tồn tại',
          'user does not exist': 'Tài khoản không tồn tại',
          'email not found': 'Tài khoản không tồn tại',
          'invalid credentials': 'Email hoặc mật khẩu không chính xác',
          'invalid email or password': 'Email hoặc mật khẩu không chính xác',
          'email not verified': 'Vui lòng xác thực tài khoản qua Email trước khi đăng nhập',
          'please verify your email': 'Vui lòng xác thực tài khoản qua Email trước khi đăng nhập',
          'account is locked': 'Tài khoản của bạn đã bị khóa',
          'account is disabled': 'Tài khoản của bạn đã bị vô hiệu hóa',
          'too many requests': 'Quá nhiều yêu cầu, vui lòng thử lại sau',
          'too many login attempts': 'Quá nhiều yêu cầu đăng nhập, vui lòng thử lại sau',
          'network error': 'Lỗi kết nối mạng, vui lòng kiểm tra lại đường truyền',
          'login failed': 'Đăng nhập thất bại'
        }

        if (typeof errorMsg === 'string') {
          const lowerMsg = errorMsg.toLowerCase()
          const matchedKey = Object.keys(errorMap).find(key => lowerMsg.includes(key))
          if (matchedKey) {
            errorMsg = errorMap[matchedKey]
          } else {
            if (lowerMsg.includes('auth/') || lowerMsg.includes('failed') || lowerMsg.includes('error')) {
              errorMsg = 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.'
            }
          }
        }

        setError(errorMsg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [setAuth]
  )

  const logout = useCallback(async () => {
    setLoading(true)
    try {
      await authService.logout()
      logoutStore()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setLoading(false)
    }
  }, [logoutStore])

  const getProfile = useCallback(async () => {
    try {
      const response = await userService.getProfile(user._id)
      return response.data.user
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load profile')
      throw err
    }
  }, [user])

  const updateProfile = useCallback(
    async (profileData) => {
      setLoading(true)
      setError(null)
      try {
        const response = await userService.updateProfile(profileData)
        updateUser(response.data.user)
        return response.data.user
      } catch (err) {
        const errorMsg = err.response?.data?.error || 'Update failed'
        setError(errorMsg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [updateUser]
  )

  return {
    user,
    loading,
    error,
    register,
    login,
    logout,
    getProfile,
    updateProfile,
  }
}

export default useAuth
