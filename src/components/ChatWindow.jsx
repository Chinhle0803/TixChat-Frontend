import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import '../styles/ChatWindow.css'
import { FiPhone, FiPhoneOff, FiVideo, FiVideoOff, FiInfo, FiMic, FiMicOff, FiPaperclip, FiSmile, FiX } from 'react-icons/fi'
import Message from './Message'
import ConversationInfoPanel from './ConversationInfoPanel'
import ShareMessageModal from './ShareMessageModal'
import { conversationService, userService } from '../services/api'
import { useDialog } from '../context/DialogContext'
import { EXPRESSION_CATEGORIES } from '../features/expressions/expressionCatalog'

const SEND_COOLDOWN_MS = 350

const isEmojiOnlyContent = (value = '') => {
  const normalized = String(value || '').trim().replace(/[\s\u200D\uFE0F]/g, '')
  return Boolean(normalized) && /^(?:\p{Extended_Pictographic})+$/u.test(normalized)
}

const CHAT_THEME_PRESETS = {
  default: {
    '--chat-bg': 'var(--background)',
    '--bubble-own-bg': 'var(--primary)',
    '--bubble-own-color': '#ffffff',
    '--bubble-other-bg': 'var(--card)',
    '--bubble-other-color': 'var(--foreground)',
  },
  snow: {
    '--chat-bg': 'var(--background)',
    '--bubble-own-bg': '#111827',
    '--bubble-own-color': '#ffffff',
    '--bubble-other-bg': 'var(--card)',
    '--bubble-other-color': '#111827',
  },
  mint: {
    '--chat-bg': '#f7faf9',
    '--bubble-own-bg': '#0f766e',
    '--bubble-own-color': '#ffffff',
    '--bubble-other-bg': '#ffffff',
    '--bubble-other-color': '#134e4a',
  },
  sunset: {
    '--chat-bg': '#fffaf5',
    '--bubble-own-bg': '#9a3412',
    '--bubble-own-color': '#ffffff',
    '--bubble-other-bg': '#ffffff',
    '--bubble-other-color': '#7c2d12',
  },
  lavender: {
    '--chat-bg': '#faf8ff',
    '--bubble-own-bg': '#5b21b6',
    '--bubble-own-color': '#ffffff',
    '--bubble-other-bg': '#ffffff',
    '--bubble-other-color': '#4c1d95',
  },
  dark: {
    '--chat-bg': '#0f172a',
    '--bubble-own-bg': '#38bdf8',
    '--bubble-own-color': '#082f49',
    '--bubble-other-bg': '#1e293b',
    '--bubble-other-color': '#e2e8f0',
  },
}

const formatFileSize = (size = 0) => {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || '')
  }
  return String(value)
}

const getReplyPreview = (replyTo) => {
  if (!replyTo) return ''

  if (typeof replyTo === 'string') {
    return replyTo.slice(0, 50)
  }

  const raw = replyTo.content || replyTo.text || replyTo.message || ''
  return String(raw).slice(0, 50)
}

const getParticipantId = (participant) => {
  if (!participant) return ''
  if (typeof participant === 'string') return normalizeId(participant)
  return normalizeId(participant._id || participant.userId || participant.id)
}

const getParticipantName = (participant, profiles = {}) => {
  if (!participant) return ''

  if (typeof participant === 'object') {
    const directName =
      participant.name ||
      participant.nickname ||
      participant.displayName ||
      participant.fullName ||
      participant.username ||
      ''
    if (directName) return directName

    const participantId = normalizeId(participant._id || participant.userId || participant.id)
    if (participantId && profiles[participantId]) {
      const profile = profiles[participantId]
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

  const profile = profiles[normalizeId(participant)]
  return profile?.nickname || profile?.displayName || profile?.fullName || profile?.username || ''
}

const ChatWindow = ({
  conversation,
  messages,
  currentUserId,
  onSendMessage,
  onSendAttachment,
  onDeleteMessage,
  onDeleteForAll,
  onEditMessage,
  onReactMessage,
  onDeleteConversation,
  onLoadMoreMessages,
  hasMoreMessages,
  loadingMoreMessages,
  typingUsers,
  loading,
  onTypingStart,
  onTypingStop,
  conversations,
  conversationPreference,
  onUpdateConversationPreference,
  onCreateGroupConversation,
  onOpenNewConversation,
  onShareMessage,
  onRefreshConversationData,
  callControls,
}) => {
  const { notify } = useDialog()
  const [messageInput, setMessageInput] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [selectedAttachment, setSelectedAttachment] = useState(null)
  const [participantProfiles, setParticipantProfiles] = useState({})
  const loadingProfileIdsRef = useRef(new Set())
  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const prevConversationIdRef = useRef('')
  const newestMessageIdRef = useRef('')
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const sendCooldownUntilRef = useRef(0)
  const sendCooldownTimerRef = useRef(null)
  const initialScrolledConversationRef = useRef('')
  const [isSending, setIsSending] = useState(false)
  const [showConversationInfo, setShowConversationInfo] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [selectedShareMessage, setSelectedShareMessage] = useState(null)
  const [expressionPickerOpen, setExpressionPickerOpen] = useState(false)
  const [currentUserGroupRole, setCurrentUserGroupRole] = useState('member')

  const createClientMessageId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  const replyPreviewMap = useMemo(() => {
    const previews = {}

    messages.forEach((msg) => {
      const id = normalizeId(msg?._id || msg?.messageId)
      const content = typeof msg?.content === 'string' ? msg.content : ''

      if (id && content) {
        previews[id] = content
      }
    })

    return previews
  }, [messages])

  const reversedMessages = useMemo(() => [...(messages || [])].reverse(), [messages])

  const senderById = useMemo(() => {
    const map = new Map()
    ;(conversation?.participants || []).forEach((participant) => {
      const id = getParticipantId(participant)
      if (id) {
        const profile = participantProfiles?.[id] || {}
        const participantObject = typeof participant === 'object'
          ? participant
          : { userId: id }

        map.set(id, {
          ...participantObject,
          ...profile,
          userId: id,
        })
      }
    })
    return map
  }, [conversation, participantProfiles])

  const missingParticipantProfileIds = useMemo(() => {
    if (!conversation) return []

    const missing = new Set()
    ;(conversation.participants || []).forEach((participant) => {
      const participantId = getParticipantId(participant)
      const participantName = getParticipantName(participant, participantProfiles)

      if (!participantId || participantId === normalizeId(currentUserId) || participantName) {
        return
      }

      if (!loadingProfileIdsRef.current.has(participantId)) {
        missing.add(participantId)
      }
    })

    return Array.from(missing)
  }, [conversation, currentUserId, participantProfiles])

  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    const conversationId = normalizeId(conversation?._id || conversation?.conversationId)
    const newestMessageId = normalizeId(messages?.[0]?._id || messages?.[0]?.messageId)

    const isConversationChanged = prevConversationIdRef.current !== conversationId
    const isNewIncomingMessage = !isConversationChanged && newestMessageId && newestMessageIdRef.current !== newestMessageId

    if (isConversationChanged) {
      prevConversationIdRef.current = conversationId
      newestMessageIdRef.current = newestMessageId
      requestAnimationFrame(() => scrollToBottom('auto'))
      return
    }

    if (isNewIncomingMessage) {
      newestMessageIdRef.current = newestMessageId
      requestAnimationFrame(() => scrollToBottom('smooth'))
    }
  }, [conversation, messages])

  useEffect(() => {
    if (!conversation) return

    stopTypingNow()
    setEditingMessage(null)
    setReplyingTo(null)
    setMessageInput('')
    setSelectedAttachment(null)

    requestAnimationFrame(() => {
      scrollToBottom('auto')
      inputRef.current?.focus()
    })

    initialScrolledConversationRef.current = ''
    setShowConversationInfo(false)
  }, [conversation])

  useEffect(() => {
    const conversationId = normalizeId(conversation?._id || conversation?.conversationId)
    if (!conversationId || conversation?.type !== 'group') {
      setCurrentUserGroupRole('member')
      return
    }

    let isCancelled = false

    const loadCurrentRole = async () => {
      try {
        const response = await conversationService.getParticipants(conversationId)
        if (isCancelled) return

        const participants = response?.data?.participants || []
        const currentUser = participants.find(
          (participant) => normalizeId(participant?.userId) === normalizeId(currentUserId)
        )

        const fallbackRole =
          normalizeId(conversation?.creatorId || conversation?.admin) === normalizeId(currentUserId)
            ? 'admin'
            : 'member'

        setCurrentUserGroupRole(String(currentUser?.role || fallbackRole || 'member'))
      } catch (error) {
        if (isCancelled) return

        const fallbackRole =
          normalizeId(conversation?.creatorId || conversation?.admin) === normalizeId(currentUserId)
            ? 'admin'
            : 'member'
        setCurrentUserGroupRole(fallbackRole)
      }
    }

    loadCurrentRole()

    return () => {
      isCancelled = true
    }
  }, [conversation, currentUserId])

  useEffect(() => {
    const conversationId = normalizeId(conversation?._id || conversation?.conversationId)
    if (!conversationId || loading) return

    if (initialScrolledConversationRef.current === conversationId) return

    const rafId = requestAnimationFrame(() => {
      scrollToBottom('auto')
      initialScrolledConversationRef.current = conversationId
    })

    return () => cancelAnimationFrame(rafId)
  }, [conversation, loading, messages.length])

  useEffect(() => {
    if (!conversation || loading || loadingMoreMessages) return

    const rafId = requestAnimationFrame(() => {
      scrollToBottom('auto')
    })

    return () => cancelAnimationFrame(rafId)
  }, [conversation, loading, loadingMoreMessages, messages.length])

  useEffect(() => {
    if (!conversation) return

    let isCancelled = false

    const fetchMissingProfiles = async () => {
      if (missingParticipantProfileIds.length === 0) return

      missingParticipantProfileIds.forEach((userId) => loadingProfileIdsRef.current.add(userId))

      const results = await Promise.allSettled(
        missingParticipantProfileIds.map(async (userId) => {
          const response = await userService.getProfile(userId)
          return { userId, user: response?.data?.user || null }
        })
      )

      if (isCancelled) return

      const nextProfiles = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.user) {
          nextProfiles[result.value.userId] = result.value.user
        }
      })

      missingParticipantProfileIds.forEach((userId) => loadingProfileIdsRef.current.delete(userId))

      if (Object.keys(nextProfiles).length > 0) {
        setParticipantProfiles((prev) => ({ ...prev, ...nextProfiles }))
      }
    }

    fetchMissingProfiles().catch((error) => {
      console.warn('⚠️ Failed to fetch participant profiles for header:', error?.message || error)
    })

    return () => {
      isCancelled = true
    }
  }, [conversation, missingParticipantProfileIds])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      if (isTypingRef.current) {
        onTypingStop?.()
        isTypingRef.current = false
      }

      if (sendCooldownTimerRef.current) {
        clearTimeout(sendCooldownTimerRef.current)
      }
    }
  }, [onTypingStop])

  const stopTypingNow = () => {
    if (!isTypingRef.current) return
    onTypingStop?.()
    isTypingRef.current = false

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
  }

  const handleInputChange = (event) => {
    const value = event.target.value
    setMessageInput(value)

    if (!value.trim()) {
      stopTypingNow()
      return
    }

    if (!isTypingRef.current) {
      onTypingStart?.()
      isTypingRef.current = true
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTypingNow()
    }, 1200)
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (isReadOnlyGroupMode) {
      await notify({
        title: 'Không có quyền gửi tin nhắn',
        message: 'Bạn không có quyền gửi tin nhắn vào nhóm này.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    const trimmedMessage = messageInput.trim()
    if ((!trimmedMessage && !selectedAttachment) || Date.now() < sendCooldownUntilRef.current) return

    try {
      sendCooldownUntilRef.current = Date.now() + SEND_COOLDOWN_MS
      setIsSending(true)

      if (sendCooldownTimerRef.current) {
        clearTimeout(sendCooldownTimerRef.current)
      }

      sendCooldownTimerRef.current = setTimeout(() => {
        setIsSending(false)
      }, SEND_COOLDOWN_MS)

      stopTypingNow()
      const clientMessageId = createClientMessageId()

      if (editingMessage) {
        await onEditMessage?.(editingMessage._id || editingMessage.messageId, trimmedMessage)
        setEditingMessage(null)
      } else if (selectedAttachment) {
        await onSendAttachment?.(
          selectedAttachment,
          trimmedMessage,
          replyingTo?._id || replyingTo?.messageId,
          { clientMessageId }
        )
      } else {
        await onSendMessage(
          trimmedMessage,
          replyingTo?._id || replyingTo?.messageId,
          {
            clientMessageId,
            ...(isEmojiOnlyContent(trimmedMessage) ? { type: 'emoji' } : {}),
          }
        )
      }

      setMessageInput('')
      setReplyingTo(null)
      setExpressionPickerOpen(false)
      setSelectedAttachment(null)
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = ''
      }
      inputRef.current?.focus()
    } catch (err) {
      console.error('Error sending message:', err)
    }
  }

  const handleAppendExpression = (emoji) => {
    const selectedEmoji = String(emoji || '').trim()
    if (!selectedEmoji || editingMessage || isReadOnlyGroupMode) return

    setMessageInput((prev) => `${prev || ''}${selectedEmoji}`)
    startTyping()
    inputRef.current?.focus()
  }

  const handleSelectAttachment = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setEditingMessage(null)
    setSelectedAttachment(file)
    inputRef.current?.focus()
  }

  const clearAttachment = () => {
    setSelectedAttachment(null)
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = ''
    }
  }

  const triggerAttachmentPicker = () => {
    if (editingMessage || isReadOnlyGroupMode) return
    attachmentInputRef.current?.click()
  }

  const handleStartEditMessage = (message) => {
    if (!message) return

    const currentContent = typeof message.content === 'string' ? message.content : ''
    setEditingMessage(message)
    setReplyingTo(null)
    clearAttachment()
    setMessageInput(currentContent)

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(currentContent.length, currentContent.length)
    })
  }

  const handleCancelEditMessage = () => {
    setEditingMessage(null)
    setMessageInput('')
    inputRef.current?.focus()
  }

  const handleShareMessage = (message) => {
    if (!message) return
    setSelectedShareMessage(message)
    setShowShareModal(true)
  }

  const handleShareMessageToFriends = async (targetUserIds) => {
    if (!selectedShareMessage) return

    await onShareMessage?.(selectedShareMessage, targetUserIds)
    await notify({
      title: 'Chia sẻ thành công',
      message: 'Đã chia sẻ tin nhắn thành công.',
      confirmText: 'OK',
      variant: 'success',
    })
    setShowShareModal(false)
    setSelectedShareMessage(null)
  }

  const isGroup = conversation?.type === 'group'
  const replyingPreview = getReplyPreview(replyingTo)
  const normalizedCurrentUserId = normalizeId(currentUserId)
  const directCounterpart = useMemo(() => {
    if (!conversation || conversation?.type !== '1-1') return null

    const participants = conversation?.participants || []
    const rawCounterpart =
      participants.find((participant) => getParticipantId(participant) !== normalizedCurrentUserId) ||
      participants[0]

    if (!rawCounterpart) return null

    const counterpartId = getParticipantId(rawCounterpart)
    const profile = participantProfiles?.[counterpartId]

    return {
      id: counterpartId,
      avatar: rawCounterpart?.avatar || profile?.avatar || conversation?.avatar || '',
      name:
        getParticipantName(rawCounterpart, participantProfiles) ||
        profile?.nickname ||
        profile?.displayName ||
        profile?.fullName ||
        profile?.username ||
        'Người dùng',
    }
  }, [conversation, normalizedCurrentUserId, participantProfiles])

  const handleUpdatePreference = useCallback(
    (patch) => {
      if (!conversation || !patch || typeof patch !== 'object') return
      const conversationId = conversation?._id || conversation?.conversationId
      if (!conversationId) return
      onUpdateConversationPreference?.(conversationId, patch)
    },
    [conversation, onUpdateConversationPreference]
  )

  const chatHeaderName = useMemo(() => {
    if (!conversation) return ''

    const customAlias = String(conversationPreference?.alias || '').trim()
    if (customAlias) {
      return customAlias
    }

    if (conversation?.type === '1-1') {
      const participants = conversation.participants || []
      const counterpart =
        participants.find((participant) => getParticipantId(participant) !== normalizedCurrentUserId) ||
        participants[0]

      return getParticipantName(counterpart, participantProfiles) || 'Người dùng'
    }

    if (conversation?.name?.trim()) return conversation.name

    const names = (conversation.participants || [])
      .map((participant) => getParticipantName(participant, participantProfiles))
      .filter(Boolean)

    return names.join(', ') || 'Nhóm chat'
  }, [conversation, conversationPreference?.alias, normalizedCurrentUserId, participantProfiles])

  const hasTypingUsers = useMemo(() => {
    if (!typingUsers) return false

    return Object.entries(typingUsers).some(([userId, isTyping]) => {
      if (!isTyping) return false
      return normalizeId(userId) !== normalizeId(currentUserId)
    })
  }, [currentUserId, typingUsers])

  const chatThemeStyle = useMemo(() => {
    const themeKey = String(conversationPreference?.chatBackground || 'default')
    return CHAT_THEME_PRESETS[themeKey] || CHAT_THEME_PRESETS.default
  }, [conversationPreference?.chatBackground])

  const isReadOnlyGroupMode = useMemo(() => {
    const isGroupConversation = conversation?.type === 'group'
    const adminOnlyMessaging = Boolean(conversation?.groupSettings?.adminOnlyMessaging)
    const canSendAsManager = currentUserGroupRole === 'admin' || currentUserGroupRole === 'moderator'

    return isGroupConversation && adminOnlyMessaging && !canSendAsManager
  }, [conversation, currentUserGroupRole])

  const conversationId = normalizeId(conversation?._id || conversation?.conversationId)
  const isCallIdle = !callControls?.callPhase || callControls.callPhase === 'idle'
  const canStartCall = Boolean(conversationId && isCallIdle)

  const handleStartCall = async (callType) => {
    if (!canStartCall) return

    try {
      await callControls?.startCall?.(conversationId, callType)
    } catch (error) {
      await notify({
        title: 'Không thể bắt đầu cuộc gọi',
        message: error?.response?.data?.error || error?.message || 'Vui lòng thử lại.',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleAcceptCall = async () => {
    try {
      await callControls?.acceptCall?.()
    } catch (error) {
      await notify({
        title: 'Không thể nhận cuộc gọi',
        message: error?.response?.data?.error || error?.message || 'Vui lòng thử lại.',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  return (
  <div className="chat-window" style={chatThemeStyle}>
      {!conversation ? (
        <div className="no-conversation">
          <div className="no-conversation-content">
            <h2>Chọn cuộc trò chuyện</h2>
            <p>Chọn một cuộc trò chuyện để bắt đầu trò chuyện</p>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <h3>{chatHeaderName}</h3>
              <p>
                {isGroup
                  ? `${conversation.participants?.length || 0} thành viên`
                  : conversation.participants?.[0]?.isOnline
                    ? 'Đang hoạt động'
                    : 'Ngoại tuyến'}
              </p>
            </div>
            <div className="chat-header-actions">
              <button
                title="Gọi"
                aria-label="call"
                onClick={() => handleStartCall('audio')}
                disabled={!canStartCall}
              >
                <FiPhone />
              </button>
              <button
                title="Video"
                aria-label="video"
                onClick={() => handleStartCall('video')}
                disabled={!canStartCall}
              >
                <FiVideo />
              </button>
              <button title="Thông tin" aria-label="info" onClick={() => setShowConversationInfo(true)}><FiInfo /></button>
            </div>
          </div>

          {callControls?.incomingCall && (
            <div className="call-banner incoming">
              <div>
                <strong>Cuộc gọi {callControls.incomingCall.callType === 'video' ? 'video' : 'thoại'} đến</strong>
                <span>{chatHeaderName}</span>
              </div>
              <div className="call-banner-actions">
                <button type="button" className="call-decline" onClick={callControls.declineCall} title="Từ chối">
                  <FiPhoneOff />
                </button>
                <button type="button" className="call-accept" onClick={handleAcceptCall} title="Nghe máy">
                  <FiPhone />
                </button>
              </div>
            </div>
          )}

          {callControls?.currentCall && (
            <div className={`call-panel ${callControls.currentCall.callType}`}>
              <audio ref={callControls.audioElementRef} autoPlay />
              {callControls.currentCall.callType === 'video' && (
                <div className="call-video-stage">
                  <div className={`call-remote-grid tile-count-${Math.min(callControls.remoteVideoTiles?.length || 0, 4)}`}>
                    {(callControls.remoteVideoTiles || []).length > 0 ? (
                      callControls.remoteVideoTiles.map((tile, index) => (
                        <video
                          key={tile.tileId}
                          ref={(element) => callControls.setRemoteVideoElement?.(tile.tileId, element)}
                          className="remote-video"
                          autoPlay
                          playsInline
                          aria-label={`remote video ${index + 1}`}
                        />
                      ))
                    ) : (
                      <div className="remote-video-placeholder">Dang cho thanh vien bat camera</div>
                    )}
                  </div>
                  <video ref={callControls.localVideoRef} className="local-video" autoPlay muted playsInline />
                  <div className="call-video-overlay">
                    <div className="call-panel-info">
                      <strong>Video call</strong>
                      <span>
                        {callControls.callPhase === 'ringing'
                          ? 'Đang đổ chuông...'
                          : callControls.callPhase === 'active'
                            ? `Đang trong cuộc gọi - ${callControls.activeDurationLabel || '00:00'}`
                            : 'Đang kết nối...'}
                      </span>
                    </div>
                    <div className="call-controls">
                      <button type="button" onClick={callControls.toggleMute} title="Tắt/bật micro">
                        {callControls.isMuted ? <FiMicOff /> : <FiMic />}
                      </button>
                      <button type="button" onClick={callControls.toggleVideo} title="Tắt/bật camera">
                        {callControls.isVideoEnabled ? <FiVideo /> : <FiVideoOff />}
                      </button>
                      <button type="button" className="call-end" onClick={callControls.endCall} title="Kết thúc">
                        <FiPhoneOff />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {callControls.currentCall.callType !== 'video' && (
                <>
                  <div className="call-panel-info">
                    <strong>Audio call</strong>
                    <span>
                      {callControls.callPhase === 'ringing'
                        ? 'Đang đổ chuông...'
                        : callControls.callPhase === 'active'
                          ? `Đang trong cuộc gọi - ${callControls.activeDurationLabel || '00:00'}`
                          : 'Đang kết nối...'}
                    </span>
                  </div>
                  <div className="call-controls">
                    <button type="button" onClick={callControls.toggleMute} title="Tắt/bật micro">
                      {callControls.isMuted ? <FiMicOff /> : <FiMic />}
                    </button>
                    <button type="button" className="call-end" onClick={callControls.endCall} title="Kết thúc">
                      <FiPhoneOff />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={messagesContainerRef} className="chat-messages" onClick={() => inputRef.current?.focus()}>
            {!loading && hasMoreMessages && (
              <button
                type="button"
                className="load-more-button"
                onClick={onLoadMoreMessages}
                disabled={loadingMoreMessages}
              >
                {loadingMoreMessages ? 'Đang tải...' : 'Xem thêm tin nhắn cũ'}
              </button>
            )}

            {loading ? (
              <div className="loading">Đang tải tin nhắn...</div>
            ) : messages.length === 0 ? (
              <div className="empty-messages">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!</div>
            ) : (
              reversedMessages.map((message) => (
                <Message
                  key={message._id || message.messageId}
                  message={message}
                  currentUserId={currentUserId}
                  isGroup={isGroup}
                  senderInfo={
                    isGroup
                      ? senderById.get(normalizeId(message.senderId || message.userId || message.sender))
                      : null
                  }
                  onReply={setReplyingTo}
                  onEdit={handleStartEditMessage}
                  onDelete={onDeleteMessage}
                  onDeleteForAll={onDeleteForAll}
                  onReact={onReactMessage}
                  onShare={handleShareMessage}
                  replyPreviewMap={replyPreviewMap}
                />
              ))
            )}

            {/* Typing Indicator */}
            {hasTypingUsers && (
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
                <p>Có người đang gõ...</p>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="chat-input-area">
            {isReadOnlyGroupMode ? (
              <div className="read-only-notice" role="status" aria-live="polite">
                Bạn không có quyền gửi tin nhắn vào nhóm này
              </div>
            ) : (
              <>
            {editingMessage && (
              <div className="reply-preview">
                <span>Đang chỉnh sửa tin nhắn...</span>
                <button type="button" onClick={handleCancelEditMessage}>✕</button>
              </div>
            )}

            {replyingTo && (
              <div className="reply-preview">
                <span>Trả lời: {replyingPreview || 'Tin nhắn gốc'}...</span>
                <button type="button" onClick={() => setReplyingTo(null)}>✕</button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                ref={attachmentInputRef}
                type="file"
                className="attachment-input-hidden"
                onChange={handleSelectAttachment}
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
              />
              <button
                type="button"
                className="attachment-button"
                onClick={triggerAttachmentPicker}
                title="Đính kèm ảnh/video/tệp"
                aria-label="attach file"
                disabled={Boolean(editingMessage)}
              >
                <FiPaperclip />
              </button>
              <div className="expression-picker-wrap">
                <button
                  type="button"
                  className="attachment-button"
                  onClick={() => setExpressionPickerOpen((prev) => !prev)}
                  title="Gửi biểu cảm"
                  aria-label="send expression"
                  disabled={Boolean(editingMessage) || isSending}
                >
                  <FiSmile />
                </button>
                {expressionPickerOpen && (
                  <div className="expression-picker-panel">
                    {EXPRESSION_CATEGORIES.map((category) => (
                      <div className="expression-picker-section" key={category.id}>
                        <div className="expression-picker-title">{category.label}</div>
                        <div className="expression-picker-grid">
                          {category.items.map((emoji) => (
                            <button
                              type="button"
                              className="expression-picker-item"
                              key={`${category.id}-${emoji}`}
                              onClick={() => handleAppendExpression(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={handleInputChange}
                placeholder={
                  editingMessage
                    ? 'Sửa tin nhắn...'
                    : selectedAttachment
                      ? 'Thêm chú thích (không bắt buộc)...'
                      : 'Nhập tin nhắn...'
                }
                className="chat-input"
                disabled={isSending}
              />
              <button
                type="submit"
                className="send-button"
                disabled={isSending || (!messageInput.trim() && !selectedAttachment)}
              >
                {isSending ? 'Đang gửi...' : editingMessage ? 'Lưu' : 'Gửi'}
              </button>
            </form>

            {selectedAttachment && (
              <div className="attachment-preview">
                <div className="attachment-preview-info">
                  <strong>{selectedAttachment.name}</strong>
                  <span>{formatFileSize(selectedAttachment.size)}</span>
                </div>
                <button
                  type="button"
                  className="attachment-preview-remove"
                  onClick={clearAttachment}
                  title="Bỏ tệp đính kèm"
                  aria-label="remove attachment"
                >
                  <FiX />
                </button>
              </div>
            )}
              </>
            )}
          </div>

          <ConversationInfoPanel
            isOpen={showConversationInfo}
            onClose={() => setShowConversationInfo(false)}
            conversation={conversation}
            currentUserId={currentUserId}
            allConversations={conversations}
            messages={messages}
            counterpart={directCounterpart}
            preference={conversationPreference || {}}
            onUpdatePreference={handleUpdatePreference}
            onOpenNewConversation={onOpenNewConversation}
            onCreateGroupConversation={onCreateGroupConversation}
            onDeleteConversation={onDeleteConversation}
            onRefreshConversationData={onRefreshConversationData}
          />

          <ShareMessageModal
            isOpen={showShareModal}
            onClose={() => {
              setShowShareModal(false)
              setSelectedShareMessage(null)
            }}
            message={selectedShareMessage}
            currentUserId={currentUserId}
            onShare={handleShareMessageToFriends}
          />
        </>
      )}
    </div>
  )
}

export default ChatWindow
