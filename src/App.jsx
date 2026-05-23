import React, { useCallback, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import AuthContainer from './pages/AuthContainer'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import { UrbanAssistantPage, UrbanFeedPage, UrbanMapPage, UrbanPostDetailPage } from './pages/UrbanPage'
import AssistantPage from './pages/AssistantPage'
import CallsPage from './pages/CallsPage'
import MainToolbar from './components/MainToolbar'
import { DialogProvider } from './context/DialogContext'
import { useDialog } from './context/DialogContext'
import { RealtimeProvider } from './context/RealtimeContext'
import InAppBannerHost from './components/InAppBannerHost'
import useCall from './hooks/useCall'
import useGlobalRealtime from './hooks/useGlobalRealtime'
import { normalizeId } from './utils/normalize'
import './styles/App.css'

const TOOLBAR_COLLAPSED_STORAGE_KEY = 'tixchat.mainToolbarCollapsed.v1'

const readToolbarCollapsed = () => {
  try {
    return localStorage.getItem(TOOLBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const AuthenticatedLayout = () => {
  const [toolbarCollapsed, setToolbarCollapsed] = useState(readToolbarCollapsed)
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const location = useLocation()
  const { notify } = useDialog()
  const currentUserId = normalizeId(user?._id || user?.userId)
  const callControls = useCall({ currentUserId })

  useGlobalRealtime({
    currentPath: location.pathname,
    callControls,
  })

  useEffect(() => {
    try {
      localStorage.setItem(TOOLBAR_COLLAPSED_STORAGE_KEY, String(toolbarCollapsed))
    } catch {
      // Local persistence is optional; the toolbar still works without it.
    }
  }, [toolbarCollapsed])

  useEffect(() => {
    const handleOpenConversation = (event) => {
      const conversationId = normalizeId(event?.detail?.conversationId)
      if (!conversationId) return
      navigate(`/chat?conversationId=${encodeURIComponent(conversationId)}`)
    }

    window.addEventListener('tixchat:open-conversation', handleOpenConversation)
    return () => {
      window.removeEventListener('tixchat:open-conversation', handleOpenConversation)
    }
  }, [navigate])

  const openConversationScreen = useCallback((conversationId = '') => {
    const normalizedConversationId = normalizeId(conversationId)
    if (!normalizedConversationId) {
      navigate('/chat')
      return
    }

    navigate(`/chat?conversationId=${encodeURIComponent(normalizedConversationId)}`)
  }, [navigate])

  const handleAcceptIncomingCall = useCallback(async (_callId, conversationId) => {
    try {
      await callControls?.acceptCall?.()
      openConversationScreen(conversationId || callControls?.incomingCall?.conversationId)
    } catch (error) {
      await notify({
        title: 'Không thể nhận cuộc gọi',
        message: error?.response?.data?.error || error?.message || 'Vui lòng thử lại.',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }, [callControls, notify, openConversationScreen])

  const handleDeclineIncomingCall = useCallback(async () => {
    try {
      await callControls?.declineCall?.()
    } catch (error) {
      await notify({
        title: 'Không thể từ chối cuộc gọi',
        message: error?.response?.data?.error || error?.message || 'Vui lòng thử lại.',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }, [callControls, notify])

  return (
    <RealtimeProvider value={{ callControls }}>
      <div className={`authenticated-shell ${toolbarCollapsed ? 'toolbar-collapsed' : ''}`}>
        <MainToolbar
          collapsed={toolbarCollapsed}
          onToggleCollapsed={() => setToolbarCollapsed((current) => !current)}
        />
        <section className="authenticated-content">
          <InAppBannerHost
            onOpenConversation={openConversationScreen}
            onOpenCallScreen={openConversationScreen}
            onAcceptCall={handleAcceptIncomingCall}
            onDeclineCall={handleDeclineIncomingCall}
          />
          <Outlet />
        </section>
      </div>
    </RealtimeProvider>
  )
}

function App() {
  const { isAuthenticated, hasInitialized, initialize } = useAuthStore()
  const { initializeTheme } = useThemeStore()

  useEffect(() => {
    initialize()
    initializeTheme()
  }, [initialize, initializeTheme])

  if (!hasInitialized) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <span className="app-loading-spinner" aria-hidden="true" />
        <span>Đang mở TixChat...</span>
      </div>
    )
  }

  return (
    <DialogProvider>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route 
            path="/auth/*" 
            element={!isAuthenticated ? <AuthContainer /> : <Navigate to="/chat" />} 
          />
          <Route element={isAuthenticated ? <AuthenticatedLayout /> : <Navigate to="/auth" />}>
            <Route 
              path="/chat" 
              element={<ChatPage />} 
            />
            <Route
              path="/calls"
              element={<CallsPage />}
            />
            <Route
              path="/assistant"
              element={<AssistantPage />}
            />
            <Route 
              path="/profile" 
              element={<ProfilePage />} 
            />
            <Route
              path="/urban"
              element={<UrbanFeedPage />}
            />
            <Route
              path="/urban/posts/:postId"
              element={<UrbanPostDetailPage />}
            />
            <Route
              path="/urban/map"
              element={<UrbanMapPage />}
            />
            <Route
              path="/urban/assistant"
              element={<UrbanAssistantPage />}
            />
          </Route>
          <Route 
            path="/" 
            element={isAuthenticated ? <Navigate to="/chat" /> : <Navigate to="/auth" />} 
          />
          <Route
            path="*"
            element={isAuthenticated ? <Navigate to="/chat" /> : <Navigate to="/auth" />}
          />
        </Routes>
      </Router>
    </DialogProvider>
  )
}

export default App
