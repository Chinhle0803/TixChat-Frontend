import { useEffect } from 'react'
import useAuthStore from '../store/authStore'
import { initSocket, disconnectSocket } from '../services/socket'

export const useSocket = () => {
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      initSocket()
    }

    return () => {
      disconnectSocket()
    }
  }, [isAuthenticated])
}

export default useSocket
