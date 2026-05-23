import axios from 'axios'
import useAuthStore from '../store/authStore'
import { createChatApiServices } from './apiContracts.js'

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/$/, '')

const resolveDefaultApiUrl = () => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${protocol}//${window.location.hostname}:5000/api`
  }

  return 'http://localhost:5000/api'
}

export const API_URL = normalizeBaseUrl(import.meta.env.VITE_API_URL || resolveDefaultApiUrl())

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add request interceptor to include auth token
apiClient.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Add response interceptor to handle token expiration
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const { refreshToken } = useAuthStore.getState()
        const response = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken,
        })

        const { accessToken } = response.data
        useAuthStore.setState({ accessToken })
        localStorage.setItem('accessToken', accessToken)

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        useAuthStore.getState().logout()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

const { authApi, userApi, conversationApi, messageApi, callApi, notificationApi, postApi, assistantApi } = createChatApiServices(apiClient)

export const authService = {
  register: authApi.register,
  login: authApi.login,
  logout: authApi.logout,
  getMe: authApi.getMe,
}

export const userService = userApi
export const conversationService = conversationApi
export const messageService = messageApi
export const callService = callApi
export const notificationService = notificationApi
export const postService = postApi
export const assistantService = assistantApi

export default apiClient
