import React, { useState, useEffect, useMemo, useRef } from 'react'
import { FiEdit3, FiUsers } from 'react-icons/fi'
import '../styles/ConversationList.css'
import { conversationService, userService } from '../services/api'
import useAuthStore from '../store/authStore'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || '')
  }
  return String(value)
}

const getParticipantId = (participant) => {
  if (!participant) return ''
  if (typeof participant === 'string') return normalizeId(participant)
  return normalizeId(participant._id || participant.userId || participant.id)
}

const getAvatarValue = (source) => (
  source?.avatar?.url ||
  source?.avatar?.src ||
  source?.avatar ||
  source?.avatarUrl ||
  source?.photoURL ||
  source?.profilePicture?.url ||
  source?.profilePicture ||
  source?.profileImage?.url ||
  source?.profileImage ||
  source?.profileImageUrl ||
  source?.picture?.url ||
  source?.picture ||
  source?.imageUrl ||
  source?.image ||
  source?.photo ||
  ''
)

const getParticipantName = (participant, profileMap = {}) => {
  if (!participant) return ''

  if (typeof participant === 'object') {
    // Name/avatar now come directly from backend in the participant object
    const directName =
      participant.name ||
      participant.nickname ||
      participant.displayName ||
      participant.fullName ||
      participant.username ||
      ''
    if (directName) return directName

    // Fallback to profileMap if name not available from backend
    const participantId = normalizeId(participant._id || participant.userId || participant.id)
    if (participantId && profileMap[participantId]) {
      const profile = profileMap[participantId]
      return (
        profile?.nickname ||
        profile?.displayName ||
        profile?.fullName ||
        profile?.username ||
        ''
      )
    }

    return ''
  }

  // Legacy: participant is a raw string ID
  const profile = profileMap[normalizeId(participant)]
  return profile?.nickname || profile?.displayName || profile?.fullName || profile?.username || ''
}

const getParticipantAvatar = (participant, profileMap = {}) => {
  if (!participant) return ''

  const participantId = getParticipantId(participant)
  const profileAvatar = getAvatarValue(profileMap?.[participantId])
  const directAvatar = typeof participant === 'object' ? getAvatarValue(participant) : ''

  return profileAvatar || directAvatar || ''
}

const getUserDisplayName = (user) => String(
  user?.nickname ||
  user?.displayName ||
  user?.fullName ||
  user?.username ||
  'Người dùng'
)

const getUserAvatarUri = (user) => getAvatarValue(user)

const getCounterpart = (conv, currentUserId) => {
  const participants = conv?.participants || []
  return participants.find((participant) => getParticipantId(participant) !== currentUserId) || participants[0]
}

const parseTimestamp = (value) => {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    // DynamoDB timestamps are usually in milliseconds
    const msValue = value < 1e12 ? value * 1000 : value
    const parsed = new Date(msValue)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatRelativeTime = (date, nowTs) => {
  if (!date) return ''

  const diffMs = Math.max(0, nowTs - date.getTime())
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'Vừa xong'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} phút`
  if (diffMs < day) return `${Math.floor(diffMs / hour)} giờ`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} ngày`

  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  })
}

const getLastMessageObject = (conv) => {
  if (!conv) return null

  if (conv.lastMessage && typeof conv.lastMessage === 'object') return conv.lastMessage
  if (conv.latestMessage && typeof conv.latestMessage === 'object') return conv.latestMessage

  if (Array.isArray(conv.messages) && conv.messages.length > 0) {
    return conv.messages[0]
  }

  return null
}

const ConversationList = ({
  conversations = [],
  selectedConversation,
  onSelectConversation,
  onlineUsers,
  unreadByConversation = {},
  conversationPreferences = {},
  onOpenNewConversation,
  onOpenCreateGroup,
  pendingRequestCount = 0,
  onSearch,
  onStartConversation,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchResults, setSearchResults] = useState({ conversations: [], users: [], suggestions: [] })
  const [searching, setSearching] = useState(false)
  const [searchActionLoading, setSearchActionLoading] = useState({})
  const [profileMap, setProfileMap] = useState({})
  const [failedAvatarKeys, setFailedAvatarKeys] = useState(() => new Set())
  const [nowTs, setNowTs] = useState(Date.now())
  const loadingProfileIdsRef = useRef(new Set())
  const currentUser = useAuthStore((state) => state.user)
  const currentUserId = normalizeId(currentUser?._id || currentUser?.userId || currentUser?.id)

  const onlineUserSet = useMemo(() => {
    const set = new Set()
    ;(onlineUsers || []).forEach((user) => {
      set.add(normalizeId(user?._id || user?.userId))
    })
    return set
  }, [onlineUsers])

  const missingProfileIds = useMemo(() => {
    const missingUserIds = new Set()

    conversations.forEach((conv) => {
      ;(conv?.participants || []).forEach((participant) => {
        const participantId = getParticipantId(participant)
        if (!participantId || participantId === currentUserId) {
          return
        }

        const cachedProfile = profileMap[participantId]
        const displayName = getParticipantName(participant, profileMap)
        const avatar = getParticipantAvatar(participant, profileMap)
        const shouldFetchProfile = !cachedProfile && (!displayName || !avatar)

        if (shouldFetchProfile && !loadingProfileIdsRef.current.has(participantId)) {
          missingUserIds.add(participantId)
        }
      })
    })

    return Array.from(missingUserIds)
  }, [conversations, currentUserId, profileMap])

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Date.now())
    }, 30 * 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let isCancelled = false

    const fetchMissingProfiles = async () => {
      if (missingProfileIds.length === 0) {
        return
      }

      missingProfileIds.forEach((userId) => loadingProfileIdsRef.current.add(userId))

      const responses = await Promise.allSettled(
        missingProfileIds.map(async (userId) => {
          const response = await userService.getProfile(userId)
          return { userId, user: response?.data?.user || null }
        })
      )

      if (isCancelled) return

      const nextProfiles = {}
      responses.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.user) {
          const user = result.value.user
          const profileIds = [
            result.value.userId,
            user?._id,
            user?.userId,
            user?.id,
          ].map(normalizeId).filter(Boolean)

          profileIds.forEach((id) => {
            nextProfiles[id] = user
          })
        }
      })

      missingProfileIds.forEach((userId) => loadingProfileIdsRef.current.delete(userId))

      if (Object.keys(nextProfiles).length > 0) {
        setProfileMap((prev) => ({ ...prev, ...nextProfiles }))
      }
    }

    fetchMissingProfiles().catch((err) => {
      console.warn('⚠️ Không thể tải profile participant:', err?.message || err)
    })

    return () => {
      isCancelled = true
    }
  }, [missingProfileIds])

  useEffect(() => {
    let cancelled = false
    const keyword = searchQuery.trim()

    if (!keyword) {
      setSearchResults({ conversations: [], users: [], suggestions: [] })
      setSearching(false)
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await conversationService.searchConversations(keyword)
        if (cancelled) return
        setSearchResults({
          conversations: response?.data?.conversations || [],
          users: response?.data?.users || [],
          suggestions: response?.data?.suggestions || [],
        })
      } catch (error) {
        if (!cancelled) {
          console.warn('⚠️ Search conversations failed:', error?.message || error)
          setSearchResults({ conversations: [], users: [], suggestions: [] })
        }
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery])

  const handleSearch = (e) => {
    setSearchQuery(e.target.value)
    if (onSearch) {
      onSearch(e.target.value)
    }
  }

  const getConversationName = (conv) => {
    const participants = conv?.participants || []
    const conversationId = normalizeId(conv?._id || conv?.conversationId)
    const customAlias = String(conversationPreferences?.[conversationId]?.alias || '').trim()

      if (conv?.type === '1-1') {
      if (customAlias) {
        return customAlias
      }

      const otherParticipant = getCounterpart(conv, currentUserId)

      const otherParticipantName = getParticipantName(otherParticipant, profileMap)
      if (otherParticipantName) return otherParticipantName

      const otherParticipantId = getParticipantId(otherParticipant)
      if (otherParticipantId) return otherParticipantId
    }

    if (conv?.name?.trim()) return conv.name

    const participantNames = participants
      .filter((participant) => getParticipantId(participant) !== currentUserId)
      .map((participant) => getParticipantName(participant, profileMap))
      .filter(Boolean)

    if (participantNames.length > 0) return participantNames.join(', ')

    return 'Người dùng'
  }

  const getLastMessage = (conv) => {
    const lastMessageObj = getLastMessageObject(conv)
    const rawContent =
      lastMessageObj?.content ||
      lastMessageObj?.text ||
      lastMessageObj?.message ||
      (Array.isArray(lastMessageObj?.attachments) && lastMessageObj.attachments.length > 0 ? '[Tệp đính kèm]' : '') ||
      conv?.lastMessageContent ||
      conv?.latestMessageContent ||
      ''

    if (!rawContent || typeof rawContent !== 'string') {
      return 'Chưa có tin nhắn'
    }

    return rawContent.substring(0, 50)
  }

  const getLastMessageTime = (conv) => {
    const lastMessageObj = getLastMessageObject(conv)

    const timestamp =
      lastMessageObj?.createdAt ||
      lastMessageObj?.updatedAt ||
      lastMessageObj?.timestamp ||
      lastMessageObj?.sentAt ||
      conv?.lastMessageAt ||
      conv?.updatedAt ||
      conv?.createdAt

    return formatRelativeTime(parseTimestamp(timestamp), nowTs)
  }

  const getConversationAvatar = (conv) => {
    if (!conv) return ''

    // Group chat: keep existing group avatar
    if (conv?.type !== '1-1') {
      return conv?.avatar || ''
    }

    // Direct chat: prefer counterpart real avatar from participant/profile map
    const counterpart = getCounterpart(conv, currentUserId)

    const participantAvatar = getParticipantAvatar(counterpart, profileMap)

    return participantAvatar || conv?.avatar || ''
  }

  const getCounterpartId = (conv) => {
    const otherParticipant = getCounterpart(conv, currentUserId)
    return getParticipantId(otherParticipant)
  }

  const renderSearchAvatar = (label, avatar) => (
    avatar ? (
      <img src={avatar} alt={label} />
    ) : (
      <div className="avatar-placeholder">
        {(String(label || '?')[0] || '?').toUpperCase()}
      </div>
    )
  )

  const withSearchActionLoading = async (key, action) => {
    setSearchActionLoading((current) => ({ ...current, [key]: true }))
    try {
      await action()
    } finally {
      setSearchActionLoading((current) => ({ ...current, [key]: false }))
    }
  }

  const isUserOnline = (userId) => {
    return onlineUserSet.has(normalizeId(userId))
  }

  const getUnreadCount = (conv) => {
    const conversationId = normalizeId(conv?._id || conv?.conversationId)
    const fromMap = Number(unreadByConversation?.[conversationId] || 0)
    const fromConversation = Number(conv?.unreadCount || 0)
    return Math.max(fromMap, fromConversation)
  }

  const filteredConversations = conversations.filter((conv) => {
    const keyword = searchQuery.trim().toLowerCase()
    const conversationId = normalizeId(conv?._id || conv?.conversationId)
    const unreadCount = getUnreadCount(conv)
    const isGroup = conv?.type === 'group'
    const name = getConversationName(conv).toLowerCase()
    const preview = getLastMessage(conv).toLowerCase()

    if (keyword && !name.includes(keyword) && !preview.includes(keyword)) {
      return false
    }

    if (activeFilter === 'unread') return unreadCount > 0
    if (activeFilter === 'groups') return isGroup
    return Boolean(conversationId)
  })

  const matchedConversations = Array.isArray(searchResults?.conversations) ? searchResults.conversations : []
  const visibleSearchUsers = Array.isArray(searchResults?.users) && searchResults.users.length
    ? searchResults.users
    : (Array.isArray(searchResults?.suggestions) ? searchResults.suggestions : [])

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <div>
          <h2>Tin nhắn</h2>
          <p>Cuộc trò chuyện và nhóm của bạn</p>
        </div>
        <div className="conversation-list-actions">
          <button
            type="button"
            onClick={onOpenNewConversation}
            className="action-with-badge"
            title="Tạo cuộc trò chuyện mới"
            aria-label="Tạo cuộc trò chuyện mới"
          >
            <FiEdit3 />
            {pendingRequestCount > 0 && (
              <span className="action-badge">{pendingRequestCount > 99 ? '99+' : pendingRequestCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenCreateGroup}
            title="Tạo nhóm"
            aria-label="Tạo nhóm"
          >
            <FiUsers />
          </button>
        </div>
      </div>

      <div className="conversation-search">
        <input
          type="text"
          placeholder="Tìm kiếm cuộc trò chuyện..."
          value={searchQuery}
          onChange={handleSearch}
        />
      </div>

      <div className="conversation-filter-tabs" role="tablist" aria-label="Lọc hội thoại">
        {[
          ['all', 'Tất cả'],
          ['unread', 'Chưa đọc'],
          ['groups', 'Nhóm'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={activeFilter === value ? 'active' : ''}
            onClick={() => setActiveFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="conversation-items">
        {searchQuery.trim() ? (
          <div className="conversation-search-results">
            <section className="conversation-search-section">
              <div className="conversation-search-section-header">
                <h3>Tin nhắn và cuộc trò chuyện</h3>
                <span>
                  {matchedConversations.length
                    ? `${matchedConversations.length} cuộc trò chuyện khớp`
                    : 'Chưa có cuộc trò chuyện khớp'}
                </span>
              </div>
              {matchedConversations.length ? (
                matchedConversations.map((conv) => {
                  const conversationId = normalizeId(conv?._id || conv?.conversationId)
                  const avatar = getConversationAvatar(conv)
                  const title = getConversationName(conv)
                  const preview = getLastMessage(conv)
                  return (
                    <div
                      key={`search-conv-${conversationId}`}
                      className="conversation-search-item"
                      onClick={() => onSelectConversation(conv)}
                    >
                      <div className="conversation-avatar">
                        {renderSearchAvatar(title, avatar)}
                      </div>
                      <div className="conversation-search-main">
                        <div className="conversation-search-head">
                          <strong>{title}</strong>
                          <span className="search-match-badge">{conv?.matchCount || 1} khớp</span>
                        </div>
                        <p>{preview}</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="conversation-search-empty">Không có cuộc trò chuyện phù hợp.</div>
              )}
            </section>

            <section className="conversation-search-section">
              <div className="conversation-search-section-header">
                <h3>{searchResults?.users?.length ? 'Người dùng' : 'Gợi ý kết bạn'}</h3>
                <span>
                  {searchResults?.users?.length
                    ? 'Mở chat cũ, tạo chat mới hoặc kết bạn'
                    : 'Không thấy kết quả khớp, đây là vài người bạn có thể kết bạn'}
                </span>
              </div>
              {searching ? (
                <div className="conversation-search-empty">Đang tìm kiếm...</div>
              ) : visibleSearchUsers.length ? (
                visibleSearchUsers.map((foundUser) => {
                  const targetUserId = normalizeId(foundUser?.userId || foundUser?._id || foundUser?.id)
                  const isFriend = Boolean(foundUser?.isFriend || foundUser?.relationStatus === 'friend')
                  const requestSent = Boolean(foundUser?.requestSent || foundUser?.relationStatus === 'request_sent')
                  const requestReceived = Boolean(foundUser?.requestReceived || foundUser?.relationStatus === 'request_received')
                  const existingConversation = conversations.find((conversation) => {
                    const participantIds = (conversation?.participants || []).map((participant) => getParticipantId(participant))
                    return participantIds.includes(currentUserId) && participantIds.includes(targetUserId)
                  })
                  const actionKey = `web-search-${targetUserId}`

                  return (
                    <div key={`search-user-${targetUserId}`} className="conversation-search-item user-result">
                      <div className="conversation-avatar">
                        {renderSearchAvatar(getUserDisplayName(foundUser), getUserAvatarUri(foundUser))}
                      </div>
                      <div className="conversation-search-main">
                        <div className="conversation-search-head">
                          <strong>{getUserDisplayName(foundUser)}</strong>
                        </div>
                        <p>
                          {isFriend
                            ? existingConversation || foundUser?.existingConversationId
                              ? 'Đã kết bạn • Mở cuộc trò chuyện cũ'
                              : 'Đã kết bạn • Tạo cuộc trò chuyện mới'
                            : requestReceived
                              ? 'Đã nhận lời mời kết bạn'
                              : requestSent
                                ? 'Đã gửi lời mời kết bạn'
                                : 'Chưa là bạn bè • Gửi lời mời kết bạn'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`conversation-search-action ${!isFriend ? 'secondary' : ''}`}
                        disabled={Boolean(searchActionLoading[actionKey]) || requestSent}
                        onClick={async (event) => {
                          event.stopPropagation()
                          await withSearchActionLoading(actionKey, async () => {
                            if (isFriend) {
                              if (existingConversation) {
                                onSelectConversation(existingConversation)
                                return
                              }
                              await onStartConversation?.(targetUserId)
                              return
                            }
                            if (requestReceived) {
                              return
                            }
                            await userService.sendFriendRequest(targetUserId)
                            setSearchResults((current) => ({
                              ...current,
                              users: (current.users || []).map((item) => (
                                normalizeId(item?.userId || item?._id || item?.id) === targetUserId
                                  ? { ...item, requestSent: true, relationStatus: 'request_sent' }
                                  : item
                              )),
                              suggestions: (current.suggestions || []).map((item) => (
                                normalizeId(item?.userId || item?._id || item?.id) === targetUserId
                                  ? { ...item, requestSent: true, relationStatus: 'request_sent' }
                                  : item
                              )),
                            }))
                          })
                        }}
                      >
                        {searchActionLoading[actionKey]
                          ? '...'
                          : isFriend
                            ? (existingConversation || foundUser?.existingConversationId ? 'Mở chat' : 'Nhắn tin')
                            : requestReceived
                              ? 'Đã nhận'
                              : requestSent
                                ? 'Đã gửi'
                                : 'Kết bạn'}
                      </button>
                    </div>
                  )
                })
              ) : (
                <div className="conversation-search-empty">Không có gợi ý phù hợp.</div>
              )}
            </section>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="empty-state">Chưa có cuộc trò chuyện</div>
        ) : (
          filteredConversations.map((conv) => {
            const unreadCount = getUnreadCount(conv)
            const conversationAvatar = getConversationAvatar(conv)
            const conversationId = normalizeId(conv._id || conv.conversationId)
            const avatarKey = `${conversationId}:${conversationAvatar}`
            const shouldShowAvatar = Boolean(conversationAvatar && !failedAvatarKeys.has(avatarKey))

            return (
            <div
              key={conversationId || conv._id || conv.conversationId}
              className={`conversation-item ${
                normalizeId(selectedConversation?._id || selectedConversation?.conversationId) ===
                conversationId
                  ? 'active'
                  : ''
              }`}
              onClick={() => onSelectConversation(conv)}
            >
              <div className="conversation-avatar">
                {shouldShowAvatar ? (
                  <img
                    src={conversationAvatar}
                    alt={getConversationName(conv)}
                    onError={() => {
                      setFailedAvatarKeys((current) => {
                        const next = new Set(current)
                        next.add(avatarKey)
                        return next
                      })
                    }}
                  />
                ) : (
                  <div className="avatar-placeholder">
                    {(getConversationName(conv)[0] || '?').toUpperCase()}
                  </div>
                )}
                {conv.type === '1-1' &&
                  conv.participants?.length > 0 &&
                  isUserOnline(getCounterpartId(conv)) && (
                    <span className="online-indicator"></span>
                  )}
              </div>

              <div className="conversation-info">
                <div className="conversation-name">{getConversationName(conv)}</div>
                <div className="conversation-preview">{getLastMessage(conv)}</div>
              </div>

              <div className="conversation-time">
                {getLastMessageTime(conv) || '—'}
                {unreadCount > 0 && (
                  <span className="conversation-unread-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default ConversationList
