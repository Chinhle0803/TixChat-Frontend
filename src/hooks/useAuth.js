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
        const errorMsg = err.response?.data?.error || 'Login failed'
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
