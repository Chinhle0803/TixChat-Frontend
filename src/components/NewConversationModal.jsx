import React, { useEffect, useMemo, useState } from 'react'
import { userService } from '../services/api'
import { useDialog } from '../context/DialogContext'
import '../styles/NewConversationModal.css'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || '')
  }
  return String(value)
}

const getDisplayName = (user) => {
  if (!user) return 'Người dùng'
  return user.nickname || user.displayName || user.fullName || user.username || 'Người dùng'
}

const NewConversationModal = ({
  isOpen,
  onClose,
  currentUserId,
  onStartConversation,
  onPendingRequestsCountChange,
}) => {
  const { confirm } = useDialog()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [friendIds, setFriendIds] = useState([])
  const [friendUsers, setFriendUsers] = useState([])
  const [pendingRequestIds, setPendingRequestIds] = useState([])
  const [pendingRequestUsers, setPendingRequestUsers] = useState([])
  const [sentRequestIds, setSentRequestIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

  const friendSet = useMemo(() => new Set(friendIds.map((id) => normalizeId(id))), [friendIds])
  const pendingSet = useMemo(
    () => new Set(pendingRequestIds.map((id) => normalizeId(id))),
    [pendingRequestIds]
  )
  const sentSet = useMemo(() => new Set(sentRequestIds.map((id) => normalizeId(id))), [sentRequestIds])

  const refreshData = async () => {
    setLoading(true)
    try {
      const [friendsResponse, requestsResponse, profileResponse] = await Promise.all([
        userService.getFriends(),
        userService.getFriendRequests(),
        userService.getCurrentProfile(),
      ])

      const nextFriends = friendsResponse?.data?.friends || []
      const nextRequests = requestsResponse?.data?.requests || []
      const nextSent = profileResponse?.data?.user?.friendRequestsSent || []

      setFriendIds(nextFriends)
      setPendingRequestIds(nextRequests)
      setSentRequestIds(nextSent)
  onPendingRequestsCountChange?.(nextRequests.length)

      // Fetch profiles for pending requests
      const pendingProfileResults = await Promise.allSettled(
        nextRequests.map(async (userId) => {
          const response = await userService.getProfile(userId)
          return response?.data?.user || null
        })
      )

      setPendingRequestUsers(
        pendingProfileResults
          .filter((item) => item.status === 'fulfilled' && item.value)
          .map((item) => item.value)
      )

      // Fetch profiles for friends so we can show them in a dedicated section
      const friendProfileResults = await Promise.allSettled(
        nextFriends.map(async (userId) => {
          const response = await userService.getProfile(userId)
          return response?.data?.user || null
        })
      )

      setFriendUsers(
        friendProfileResults
          .filter((item) => item.status === 'fulfilled' && item.value)
          .map((item) => item.value)
      )
    } catch (error) {
      console.error('Failed to load modal data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    refreshData()
  }, [isOpen])

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const response = await userService.searchUsers(trimmed)
      const users = response?.data?.users || []
      setSearchResults(users.filter((u) => normalizeId(u.userId || u._id) !== normalizeId(currentUserId)))
    } catch (error) {
      console.error('Failed to search users:', error)
    } finally {
      setSearching(false)
    }
  }

  const withActionLoading = async (key, action) => {
    setActionLoading((prev) => ({ ...prev, [key]: true }))
    try {
      await action()
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleSendRequest = async (userId) => {
    await withActionLoading(`send-${userId}`, async () => {
      await userService.sendFriendRequest(userId)
      await refreshData()
    })
  }

  const handleAcceptRequest = async (userId) => {
    await withActionLoading(`accept-${userId}`, async () => {
      await userService.acceptFriendRequest(userId)
      await refreshData()
      await onStartConversation?.(userId)
      onClose?.()
    })
  }

  const handleRejectRequest = async (userId) => {
    await withActionLoading(`reject-${userId}`, async () => {
      await userService.rejectFriendRequest(userId)
      await refreshData()
    })
  }

  const handleStartConversation = async (userId) => {
    await withActionLoading(`chat-${userId}`, async () => {
      await onStartConversation?.(userId)
      onClose?.()
    })
  }

  const handleRemoveFriend = async (userId) => {
    const confirmed = await confirm({
      title: 'Xác nhận hủy kết bạn',
      message: 'Bạn có chắc muốn hủy kết bạn với người này không?',
      confirmText: 'Hủy kết bạn',
      cancelText: 'Giữ lại',
      variant: 'warning',
    })
    if (!confirmed) return

    await withActionLoading(`unfriend-${userId}`, async () => {
      await userService.removeFriend(userId)
      await refreshData()
    })
  }

  if (!isOpen) return null

  return (
    <div className="new-conversation-overlay" onClick={onClose}>
      <div className="new-conversation-modal" onClick={(event) => event.stopPropagation()}>
        <div className="new-conversation-header">
          <h3>Tìm bạn & tạo cuộc trò chuyện</h3>
          <button onClick={onClose} title="Đóng">✕</button>
        </div>

        <div className="new-conversation-search">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearch()
            }}
            placeholder="Tìm theo username hoặc tên..."
          />
          <button onClick={handleSearch} disabled={searching}>
            {searching ? 'Đang tìm...' : 'Tìm'}
          </button>
        </div>

        <div className="new-conversation-section">
          <h4>Lời mời kết bạn</h4>
          {loading ? (
            <p className="empty-state">Đang tải lời mời...</p>
          ) : pendingRequestUsers.length === 0 ? (
            <p className="empty-state">Không có lời mời chờ xác nhận</p>
          ) : (
            pendingRequestUsers.map((user) => {
              const userId = normalizeId(user.userId || user._id)
              return (
                <div key={userId} className="user-result-item">
                  <div>
                    <p className="user-name">{getDisplayName(user)}</p>
                    <p className="user-subtext">@{user.username || 'unknown'}</p>
                  </div>
                  <div className="user-actions">
                    <button
                      className="primary"
                      disabled={Boolean(actionLoading[`accept-${userId}`])}
                      onClick={() => handleAcceptRequest(userId)}
                    >
                      Xác nhận
                    </button>
                    <button
                      className="danger"
                      disabled={Boolean(actionLoading[`reject-${userId}`])}
                      onClick={() => handleRejectRequest(userId)}
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="new-conversation-section">
          <h4>Danh sách bạn bè</h4>
          {loading ? (
            <p className="empty-state">Đang tải danh sách bạn bè...</p>
          ) : friendUsers.length === 0 ? (
            <p className="empty-state">Bạn chưa có bạn bè nào</p>
          ) : (
            friendUsers.map((user) => {
              const userId = normalizeId(user.userId || user._id)

              return (
                <div key={userId} className="user-result-item">
                  <div>
                    <p className="user-name">{getDisplayName(user)}</p>
                    <p className="user-subtext">@{user.username || 'unknown'}</p>
                  </div>

                  <div className="user-actions">
                    <button
                      className="secondary"
                      disabled={Boolean(actionLoading[`chat-${userId}`])}
                      onClick={() => handleStartConversation(userId)}
                    >
                      Nhắn tin
                    </button>

                    <button
                      className="danger"
                      disabled={Boolean(actionLoading[`unfriend-${userId}`])}
                      onClick={() => handleRemoveFriend(userId)}
                    >
                      Hủy kết bạn
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="new-conversation-section">
          <h4>Kết quả tìm kiếm</h4>

          {searchResults.length === 0 ? (
            <p className="empty-state">Nhập từ khóa để tìm bạn mới</p>
          ) : (
            searchResults.map((user) => {
              const userId = normalizeId(user.userId || user._id)
              const isFriend = friendSet.has(userId)
              const isPending = pendingSet.has(userId)
              const isSent = sentSet.has(userId)

              return (
                <div key={userId} className="user-result-item">
                  <div>
                    <p className="user-name">{getDisplayName(user)}</p>
                    <p className="user-subtext">@{user.username || 'unknown'}</p>
                  </div>

                  <div className="user-actions">
                    <button
                      className="secondary"
                      disabled={Boolean(actionLoading[`chat-${userId}`])}
                      onClick={() => handleStartConversation(userId)}
                    >
                      Nhắn tin
                    </button>

                    {isFriend ? (
                      <button
                        className="danger"
                        disabled={Boolean(actionLoading[`unfriend-${userId}`])}
                        onClick={() => handleRemoveFriend(userId)}
                      >
                        Hủy kết bạn
                      </button>
                    ) : isPending ? (
                      <button
                        className="primary"
                        disabled={Boolean(actionLoading[`accept-${userId}`])}
                        onClick={() => handleAcceptRequest(userId)}
                      >
                        Xác nhận
                      </button>
                    ) : isSent ? (
                      <button className="secondary" disabled>
                        Đã gửi lời mời
                      </button>
                    ) : (
                      <button
                        className="primary"
                        disabled={Boolean(actionLoading[`send-${userId}`])}
                        onClick={() => handleSendRequest(userId)}
                      >
                        Kết bạn
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default NewConversationModal
