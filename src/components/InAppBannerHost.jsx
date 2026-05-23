import React, { useEffect } from 'react'
import { FiBell, FiMessageSquare, FiPhone, FiPhoneCall, FiX } from 'react-icons/fi'
import { useRealtimeUiStore } from '../store/realtimeUiStore'
import '../styles/InAppBannerHost.css'

const getBannerIcon = (type = '') => {
  if (type === 'call') return <FiPhoneCall />
  if (type === 'message') return <FiMessageSquare />
  return <FiBell />
}

export default function InAppBannerHost({
  onOpenConversation,
  onOpenCallScreen,
  onAcceptCall,
  onDeclineCall,
}) {
  const banners = useRealtimeUiStore((state) => state.banners)
  const dismissBanner = useRealtimeUiStore((state) => state.dismissBanner)

  useEffect(() => {
    const timers = (banners || [])
      .filter((banner) => !banner.persistent && Number.isFinite(Number(banner?.expiresAt)))
      .map((banner) => {
        const remaining = Math.max(0, Number(banner.expiresAt) - Date.now())
        return window.setTimeout(() => dismissBanner(banner.id), remaining)
      })

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [banners, dismissBanner])

  if (!Array.isArray(banners) || banners.length === 0) {
    return null
  }

  return (
    <div className="inapp-banner-host" aria-live="polite" aria-atomic="true">
      {banners.map((banner) => {
        const conversationId = String(banner?.data?.conversationId || '').trim()
        const callId = String(banner?.data?.callId || '').trim()
        const isCallBanner = banner.type === 'call'

        const handleOpen = () => {
          dismissBanner(banner.id)
          if (isCallBanner) {
            onOpenCallScreen?.(conversationId)
            return
          }
          onOpenConversation?.(conversationId)
        }

        return (
          <div
            key={banner.id}
            className={`inapp-banner-card ${isCallBanner ? 'is-call' : 'is-message'}`}
            role="status"
          >
            <button
              type="button"
              className="inapp-banner-main"
              onClick={handleOpen}
              aria-label={isCallBanner ? 'Mở cuộc gọi' : 'Mở cuộc trò chuyện'}
            >
              <span className="inapp-banner-icon" aria-hidden="true">
                {getBannerIcon(banner.type)}
              </span>
              <span className="inapp-banner-copy">
                <strong>{banner.title}</strong>
                <span>{banner.body}</span>
              </span>
            </button>

            <div className="inapp-banner-actions">
              {isCallBanner ? (
                <>
                  <button
                    type="button"
                    className="inapp-banner-action secondary"
                    onClick={() => onDeclineCall?.(callId)}
                  >
                    Từ chối
                  </button>
                  <button
                    type="button"
                    className="inapp-banner-action primary"
                    onClick={() => onAcceptCall?.(callId, conversationId)}
                  >
                    Nghe máy
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="inapp-banner-action primary"
                  onClick={handleOpen}
                >
                  Mở chat
                </button>
              )}

              <button
                type="button"
                className="inapp-banner-close"
                onClick={() => dismissBanner(banner.id)}
                aria-label="Đóng thông báo"
              >
                <FiX />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
