import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useChat from '../hooks/useChat'
import useChatStore from '../store/chatStore'
import ConversationList from '../components/ConversationList'
import ChatWindow from '../components/ChatWindow'
import ErrorBoundary from '../components/ErrorBoundary'
import NewConversationModal from '../components/NewConversationModal'
import CreateGroupModal from '../components/CreateGroupModal'
import '../styles/ChatPage.css'
import { FiMenu, FiPhone, FiPhoneOff, FiVideo, FiVideoOff, FiMic, FiMicOff } from 'react-icons/fi'
import { conversationService, messageService, userService } from '../services/api'
import { useDialog } from '../context/DialogContext'
import { useRealtimeContext } from '../context/RealtimeContext'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || '')
  }
  return String(value)
}

const getConversationParticipantIds = (conversation) => {
  const participants =
    conversation?.participants ||
    conversation?.participantIds ||
    []

  return participants
    .map((participant) =>
      normalizeId(
        typeof participant === 'object'
          ? participant._id || participant.userId || participant.id
          : participant
      )
    )
    .filter(Boolean)
}

const getCurrentConversationTypingUsers = (typingUsers, currentConversation) => {
  const conversationId = normalizeId(currentConversation?._id || currentConversation?.conversationId)
  if (!conversationId) return {}
  return typingUsers?.[conversationId] || {}
}

const FORWARDED_MARKER = '[[FORWARDED]]'

const createClientMessageId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const buildSharedMessageContent = (message) => {
  const text = String(message?.content || '').trim()
  const firstAttachment = Array.isArray(message?.attachments) ? message.attachments[0] : null
  const attachmentName = firstAttachment?.name ? String(firstAttachment.name).trim() : ''

  const parts = [FORWARDED_MARKER]
  if (text) parts.push(text)
  if (attachmentName) parts.push(`📎 ${attachmentName}`)
  if (!text && !attachmentName) parts.push('[Tin nhắn không có nội dung hiển thị]')

  return parts.join('\n')
}

const inferMimeTypeByFileName = (fileName = '') => {
  const extension = String(fileName).split('.').pop()?.toLowerCase()

  const mimeByExtension = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
  }

  return mimeByExtension[extension] || 'application/octet-stream'
}

const downloadAttachmentAsFile = async (attachment = {}) => {
  if (!attachment?.url) {
    throw new Error('Attachment URL is missing')
  }

  const response = await fetch(attachment.url)
  if (!response.ok) {
    throw new Error(`Cannot download attachment: ${response.status}`)
  }

  const blob = await response.blob()
  const fileName = attachment?.name || `attachment-${Date.now()}`
  const mimeType = attachment?.mimeType || blob.type || inferMimeTypeByFileName(fileName)

  return new File([blob], fileName, { type: mimeType })
}

const normalizeAttachmentForForward = (attachment) => {
  if (!attachment) return null

  if (typeof attachment === 'string') {
    const fallbackName = attachment.split('/').pop() || `attachment-${Date.now()}`
    return {
      url: attachment,
      name: fallbackName,
      mimeType: inferMimeTypeByFileName(fallbackName),
      size: 0,
    }
  }

  if (typeof attachment !== 'object') return null

  const url = attachment.url || attachment.src || attachment.link || ''
  if (!url) return null

  const name =
    attachment.name ||
    attachment.fileName ||
    attachment.originalName ||
    String(url).split('/').pop() ||
    `attachment-${Date.now()}`

  return {
    ...attachment,
    url,
    name,
    mimeType:
      attachment.mimeType ||
      attachment.type ||
      inferMimeTypeByFileName(name),
    size: Number(attachment.size || 0),
  }
}

const CONVERSATION_PREFERENCES_STORAGE_KEY = 'tixchat.conversationPreferences.v1'

const createDefaultPreference = () => ({
  alias: '',
  muted: false,
  pinned: false,
  hidden: false,
  autoDelete: 'never',
})

const readConversationPreferences = () => {
  try {
    const raw = localStorage.getItem(CONVERSATION_PREFERENCES_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch (error) {
    console.warn('⚠️ Failed to parse conversation preferences:', error?.message || error)
    return {}
  }
}

const ChatPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { notify, confirm } = useDialog()
  const { callControls: realtimeCallControls } = useRealtimeContext()
  const { user } = useAuthStore()
  const {
    conversations,
    currentConversation,
    messages,
    loading,
    loadingMoreMessages,
    hasMoreMessages,
    error,
    getConversations,
    openConversation,
    createConversation,
  deleteConversation,
  leaveConversation,
    sendMessage,
    sendAttachmentMessage,
    loadMoreMessages,
    editMessage,
    deleteMessage,
    deleteMessageForAll,
    toggleMessageReaction,
    startTyping,
    stopTyping,
  } = useChat()
  const onlineUsers = useChatStore((state) => state.onlineUsers)
  const typingUsers = useChatStore((state) => state.typingUsers)
  const unreadByConversation = useChatStore((state) => state.unreadByConversation)
  const friendRequestCount = useChatStore((state) => state.friendRequestCount)
  const setFriendRequestCount = useChatStore((state) => state.setFriendRequestCount)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showNewConversationModal, setShowNewConversationModal] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [conversationPreferences, setConversationPreferences] = useState(() => readConversationPreferences())
  const displayName = user?.fullName || user?.username || 'User'
  const displayInitial = displayName.charAt(0).toUpperCase()
  const pendingRequestedConversationIdRef = useRef('')
  const openConversationRef = useRef(openConversation)

  useEffect(() => {
    openConversationRef.current = openConversation
  }, [openConversation])

  const visibleConversations = useMemo(() => {
    const list = Array.isArray(conversations) ? [...conversations] : []

    const filtered = list.filter((conversation) => {
      const id = normalizeId(conversation?._id || conversation?.conversationId)
      return !conversationPreferences?.[id]?.hidden
    })

    filtered.sort((a, b) => {
      const idA = normalizeId(a?._id || a?.conversationId)
      const idB = normalizeId(b?._id || b?.conversationId)
      const pinnedA = Boolean(conversationPreferences?.[idA]?.pinned)
      const pinnedB = Boolean(conversationPreferences?.[idB]?.pinned)

      if (pinnedA !== pinnedB) {
        return pinnedA ? -1 : 1
      }

      const tsA = Number(a?.lastMessageAt || a?.updatedAt || a?.createdAt || 0)
      const tsB = Number(b?.lastMessageAt || b?.updatedAt || b?.createdAt || 0)
      return tsB - tsA
    })

    return filtered
  }, [conversations, conversationPreferences])

  const currentConversationId = normalizeId(currentConversation?._id || currentConversation?.conversationId)
  const currentConversationPreference = conversationPreferences?.[currentConversationId] || createDefaultPreference()
  const callControls = realtimeCallControls || {}
  const activeCall = callControls?.currentCall
  const activeCallConversationId = normalizeId(activeCall?.conversationId)
  const showGlobalActiveCall = Boolean(activeCall && activeCallConversationId && activeCallConversationId !== currentConversationId)

  const resolveCallTitle = useCallback((call) => {
    const conversationId = normalizeId(call?.conversationId)
    const matchedConversation = conversations.find((conversation) => {
      const id = normalizeId(conversation?._id || conversation?.conversationId)
      return id === conversationId
    })

    if (!matchedConversation) return 'Cuộc gọi TixChat'
    if (String(matchedConversation?.type || '').toLowerCase() === 'group') {
      return matchedConversation?.name || 'Nhóm chat'
    }

    const currentUserId = normalizeId(user?._id || user?.userId)
    const counterpart = (matchedConversation?.participants || [])
      .find((participant) => normalizeId(participant?._id || participant?.userId || participant?.id || participant) !== currentUserId)

    if (counterpart && typeof counterpart === 'object') {
      return counterpart.nickname || counterpart.displayName || counterpart.fullName || counterpart.name || counterpart.username || 'Người dùng'
    }

    return matchedConversation?.name || 'Người dùng'
  }, [conversations, user])

  useEffect(() => {
    getConversations()
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadInitialFriendRequestsCount = async () => {
      try {
        const response = await userService.getFriendRequests()
        if (isCancelled) return

        const requests = response?.data?.requests || []
        setFriendRequestCount(requests.length)
      } catch (error) {
        console.warn('⚠️ Failed to load friend request count:', error?.message || error)
      }
    }

    loadInitialFriendRequestsCount()

    return () => {
      isCancelled = true
    }
  }, [setFriendRequestCount])

  useEffect(() => {
    localStorage.setItem(
      CONVERSATION_PREFERENCES_STORAGE_KEY,
      JSON.stringify(conversationPreferences)
    )
  }, [conversationPreferences])

  const requestedConversationId = normalizeId(searchParams.get('conversationId'))

  useEffect(() => {
    if (!requestedConversationId) {
      pendingRequestedConversationIdRef.current = ''
      return
    }

    if (pendingRequestedConversationIdRef.current === requestedConversationId) {
      return
    }

    pendingRequestedConversationIdRef.current = requestedConversationId

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('conversationId')
    setSearchParams(nextParams, { replace: true })

    let isCancelled = false

    const openRequestedConversation = async () => {
      try {
        await openConversationRef.current?.(requestedConversationId)
        if (isCancelled) return

        setShowSidebar(false)
      } catch (error) {
        console.warn('Cannot open requested conversation:', error?.message || error)
      }
    }

    openRequestedConversation()

    return () => {
      isCancelled = true
    }
  }, [requestedConversationId, setSearchParams])

  const handleSelectConversation = async (conversation) => {
    await openConversation(conversation._id || conversation.conversationId)
    setShowSidebar(false)
  }

  const handleRefreshConversationData = async () => {
    const activeConversationId = normalizeId(currentConversation?._id || currentConversation?.conversationId)

    await getConversations()

    if (!activeConversationId) {
      return
    }

    try {
      await openConversation(activeConversationId)
    } catch (error) {
      console.warn('⚠️ Cannot reopen conversation after refresh:', error?.message || error)
    }
  }

  const handleSendMessage = async (content, replyTo, options) => {
    try {
      await sendMessage(content, replyTo, options)
    } catch (err) {
      console.error('Error sending message:', err)
    }
  }

  const handleSendAttachment = async (file, content, replyTo, options) => {
    try {
      await sendAttachmentMessage(file, content, replyTo, options)
    } catch (err) {
      console.error('Error sending attachment message:', err)
    }
  }

  const handleDeleteMessage = async (messageId) => {
    const shouldDelete = await confirm({
      title: 'Xác nhận xóa tin nhắn',
      message: 'Bạn có chắc muốn xóa tin nhắn này không?',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'warning',
    })
    if (!shouldDelete) return

    try {
      await deleteMessage(messageId)
    } catch (err) {
      console.error('Error deleting message:', err)
      await notify({
        title: 'Không thể xóa tin nhắn',
        message: err.response?.data?.error || 'Xóa tin nhắn thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleDeleteForAllMessage = async (messageId) => {
    const shouldDelete = await confirm({
      title: 'Xóa tin nhắn với mọi người',
      message: 'Tin nhắn sẽ bị xóa khỏi cuộc trò chuyện của tất cả mọi người. Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'warning',
    })
    if (!shouldDelete) return

    try {
      await deleteMessageForAll(messageId)
    } catch (err) {
      console.error('Error deleting message for all:', err)
      await notify({
        title: 'Không thể xóa tin nhắn',
        message: err.response?.data?.error || 'Xóa tin nhắn với mọi người thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleEditMessage = async (messageId, nextContent) => {
    try {
      await editMessage(messageId, nextContent)
    } catch (err) {
      console.error('Error editing message:', err)
    }
  }

  const handleReactToMessage = async (message, emoji) => {
    try {
      await toggleMessageReaction(message, emoji)
    } catch (err) {
      console.error('Error reacting to message:', err)
      await notify({
        title: 'Không thể thả cảm xúc',
        message: err.response?.data?.error || 'Thả cảm xúc thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleDeleteConversation = async () => {
    if (!currentConversation) return
    const conversationId = currentConversation?._id || currentConversation?.conversationId

    // If it's a group, surface Leave / Dissolve semantics depending on user's role
    if (currentConversation?.type === 'group') {
      const currentUserId = normalizeId(user?._id || user?.userId)
      const participants = currentConversation?.participants || []
      const me = participants.find((p) => {
        const pid = normalizeId(p?._id || p?.userId || p?.id)
        return pid && pid === currentUserId
      })

      const isOwner =
        normalizeId(currentConversation?.creatorId || currentConversation?.admin) === currentUserId ||
        String(me?.role || '').toLowerCase() === 'owner'

      if (isOwner) {
        const confirmed = await confirm({
          title: 'Giải tán nhóm?',
          message: 'Hành động này sẽ xóa toàn bộ nhóm cho tất cả thành viên và không thể hoàn tác. Bạn có chắc?',
          confirmText: 'Giải tán',
          cancelText: 'Hủy',
          variant: 'warning',
        })
        if (!confirmed) return

        try {
          await conversationService.dissolveConversation(conversationId)
          setShowSidebar(true)
          await getConversations()
        } catch (err) {
          console.error('Error dissolving group:', err)
          await notify({
            title: 'Không thể giải tán nhóm',
            message: err.response?.data?.error || 'Giải tán nhóm thất bại',
            confirmText: 'Đã hiểu',
            variant: 'error',
          })
        }

        return
      }

      // Regular member -> leave group
      const shouldLeave = await confirm({
        title: 'Rời nhóm?',
        message: 'Bạn sẽ rời nhóm này. Hành động này sẽ xóa nhóm khỏi danh sách của bạn nhưng không ảnh hưởng đến các thành viên khác.',
        confirmText: 'Rời nhóm',
        cancelText: 'Hủy',
        variant: 'warning',
      })
      if (!shouldLeave) return

      try {
        await conversationService.leaveConversation(conversationId)
        // Clear local view/state
        try {
          leaveConversation()
        } catch (localErr) {
          // swallow local clear errors
        }
        setShowSidebar(true)
        await getConversations()
      } catch (err) {
        console.error('Error leaving group:', err)
        await notify({
          title: 'Không thể rời nhóm',
          message: err.response?.data?.error || 'Rời nhóm thất bại',
          confirmText: 'Đã hiểu',
          variant: 'error',
        })
      }

      return
    }

    // Fallback: non-group conversation (1-1) -> delete for current user
    const shouldDelete = await confirm({
      title: 'Xác nhận xóa cuộc trò chuyện',
      message:
        'Bạn có chắc muốn xóa đoạn chat này khỏi danh sách của bạn không? Bên kia vẫn sẽ còn thấy cuộc trò chuyện.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'warning',
    })
    if (!shouldDelete) return

    try {
      await deleteConversation(conversationId)
      setShowSidebar(true)
    } catch (err) {
      console.error('Error deleting conversation:', err)
      await notify({
        title: 'Không thể xóa cuộc trò chuyện',
        message: err.response?.data?.error || 'Xóa đoạn chat thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleStartConversationWithUser = async (userId) => {
    try {
      const targetUserId = normalizeId(userId)
      const currentUserId = normalizeId(user?._id || user?.userId)

      const existingConversation = conversations.find((conversation) => {
        const type = conversation?.type
        if (type !== '1-1' && type !== 'direct') return false

        const participantIds = getConversationParticipantIds(conversation)
        return (
          participantIds.includes(currentUserId) &&
          participantIds.includes(targetUserId)
        )
      })

      const existingConversationId =
        existingConversation?._id || existingConversation?.conversationId

      if (existingConversationId) {
        await openConversation(existingConversationId)
        setShowSidebar(false)
        return
      }

      const created = await createConversation('1-1', [targetUserId])
      const createdConversationId = created?._id || created?.conversationId
      if (!createdConversationId) return

      await getConversations()
      await openConversation(createdConversationId)
      setShowSidebar(false)
    } catch (error) {
      console.error('Create conversation failed:', error)
    }
  }

  const handleUpdateConversationPreference = (conversationId, patch) => {
    const normalizedConversationId = normalizeId(conversationId)
    if (!normalizedConversationId || !patch || typeof patch !== 'object') return

    setConversationPreferences((prev) => {
      const currentPreference = {
        ...createDefaultPreference(),
        ...(prev?.[normalizedConversationId] || {}),
      }

      return {
        ...(prev || {}),
        [normalizedConversationId]: {
          ...currentPreference,
          ...patch,
        },
      }
    })
  }

  const handleCreateGroupConversation = async (participantIds, groupName) => {
    const cleanParticipantIds = [...new Set((participantIds || []).map((id) => normalizeId(id)).filter(Boolean))]

    if (cleanParticipantIds.length < 2) {
      throw new Error('Nhóm trò chuyện cần ít nhất 3 thành viên (bao gồm bạn).')
    }

    const created = await createConversation('group', cleanParticipantIds, groupName)
    const createdConversationId = created?._id || created?.conversationId

    if (createdConversationId) {
      await openConversation(createdConversationId)
      setShowSidebar(false)

      getConversations().catch((error) => {
        console.warn('⚠️ Failed to refresh conversations after create group:', error?.message || error)
      })
    }

    return created
  }

  const handleShareMessageToFriends = async (message, targetUserIds = []) => {
    const sender = normalizeId(user?._id || user?.userId)
    const normalizedTargetIds = [...new Set(targetUserIds.map((id) => normalizeId(id)).filter(Boolean))]
      .filter((id) => id !== sender)

    if (!message || normalizedTargetIds.length === 0) {
      throw new Error('Vui lòng chọn ít nhất 1 bạn để chia sẻ.')
    }

  const content = buildSharedMessageContent(message)
  const attachments = (Array.isArray(message?.attachments) ? message.attachments : [])
    .map((attachment) => normalizeAttachmentForForward(attachment))
    .filter(Boolean)
  const hasAttachments = attachments.length > 0

    for (const targetUserId of normalizedTargetIds) {
      const existingConversation = conversations.find((conversation) => {
        const type = conversation?.type
        if (type !== '1-1' && type !== 'direct') return false

        const participantIds = getConversationParticipantIds(conversation)
        return participantIds.includes(sender) && participantIds.includes(targetUserId)
      })

      let conversationId = existingConversation?._id || existingConversation?.conversationId

      if (!conversationId) {
        const response = await conversationService.createConversation('1-1', [targetUserId])
        const createdConversation = response?.data?.conversation
        conversationId = createdConversation?._id || createdConversation?.conversationId
      }

      if (!conversationId) {
        throw new Error('Không thể tạo đoạn chat để chia sẻ tin nhắn.')
      }

      if (!hasAttachments) {
        await messageService.sendMessage(
          conversationId,
          content,
          null,
          { clientMessageId: createClientMessageId() }
        )

        continue
      }

      let forwardedTextIncluded = false

      for (const [index, attachment] of attachments.entries()) {
        try {
          const file = await downloadAttachmentAsFile(attachment)
          const forwardedCaption =
            !forwardedTextIncluded
              ? content
              : `${FORWARDED_MARKER}\n📎 ${attachment?.name || `Tệp đính kèm ${index + 1}`}`

          await messageService.sendAttachment(
            conversationId,
            file,
            forwardedCaption,
            null,
            { clientMessageId: createClientMessageId() }
          )

          forwardedTextIncluded = true
        } catch (attachmentError) {
          try {
            await messageService.forwardAttachmentByUrl(
              conversationId,
              attachment?.url,
              {
                name: attachment?.name,
                mimeType: attachment?.mimeType,
                size: attachment?.size,
              },
              !forwardedTextIncluded
                ? content
                : `${FORWARDED_MARKER}\n📎 ${attachment?.name || `Tệp đính kèm ${index + 1}`}`,
              null,
              { clientMessageId: createClientMessageId() }
            )

            forwardedTextIncluded = true
            console.warn(
              '⚠️ Forward attachment switched to server-side mode:',
              attachmentError?.message || attachmentError
            )
          } catch (serverForwardError) {
            const fallbackContent = `${FORWARDED_MARKER}\nKhông thể chuyển tiếp tệp "${attachment?.name || 'attachment'}" trực tiếp.\nLink gốc: ${attachment?.url || 'N/A'}`

            await messageService.sendMessage(
              conversationId,
              fallbackContent,
              null,
              { clientMessageId: createClientMessageId() }
            )

            console.warn(
              '⚠️ Forward attachment fallback used:',
              serverForwardError?.message || serverForwardError
            )
          }
        }
      }
    }

    await getConversations()
  }

  return (
    <div className="chat-page">
      <div className="chat-layout">
        {/* Sidebar */}
        <div className={`sidebar ${showSidebar ? 'visible' : 'hidden'}`}>
          <div className="sidebar-header">
            <h2>TixChat</h2>
          </div>

          {user && (
            <div className="user-info">
              <div className="user-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt={displayName} />
                ) : (
                  <div className="avatar-placeholder">{displayInitial}</div>
                )}
              </div>
              <div className="user-details">
                <p className="user-name">{displayName}</p>
                <p className="user-username">@{user?.username || 'unknown'}</p>
              </div>
            </div>
          )}

          <ConversationList
            conversations={visibleConversations}
            selectedConversation={currentConversation}
            onSelectConversation={handleSelectConversation}
            onOpenNewConversation={() => setShowNewConversationModal(true)}
            onOpenCreateGroup={() => setShowCreateGroupModal(true)}
            onStartConversation={handleStartConversationWithUser}
            pendingRequestCount={friendRequestCount}
            onlineUsers={onlineUsers}
            unreadByConversation={unreadByConversation}
            conversationPreferences={conversationPreferences}
          />
        </div>

        {/* Main Chat Area */}
        <div className="main-content">
          {showSidebar && (
            <button className="toggle-sidebar" onClick={() => setShowSidebar(false)} aria-label="hide sidebar">
              <FiMenu />
            </button>
          )}

          <ErrorBoundary>
            <ChatWindow
              conversation={currentConversation}
              messages={messages}
              conversations={conversations}
              currentUserId={user?._id || user?.userId}
              conversationPreference={currentConversationPreference}
              onSendMessage={handleSendMessage}
              onSendAttachment={handleSendAttachment}
              onDeleteMessage={handleDeleteMessage}
              onDeleteForAll={handleDeleteForAllMessage}
              onEditMessage={handleEditMessage}
              onReactMessage={handleReactToMessage}
              onShareMessage={handleShareMessageToFriends}
              onDeleteConversation={handleDeleteConversation}
              onUpdateConversationPreference={handleUpdateConversationPreference}
              onOpenNewConversation={() => setShowNewConversationModal(true)}
              onCreateGroupConversation={handleCreateGroupConversation}
              onLoadMoreMessages={loadMoreMessages}
              hasMoreMessages={hasMoreMessages}
              loadingMoreMessages={loadingMoreMessages}
              typingUsers={getCurrentConversationTypingUsers(typingUsers, currentConversation)}
              loading={loading}
              onTypingStart={startTyping}
              onTypingStop={stopTyping}
              onRefreshConversationData={handleRefreshConversationData}
              callControls={callControls}
            />
          </ErrorBoundary>
        </div>
      </div>

      {error && (
        <div className="global-error">
          <p>{error}</p>
        </div>
      )}

      {showGlobalActiveCall && (
        <div className="global-active-call">
          <audio ref={callControls.audioElementRef} autoPlay />
          {activeCall.callType === 'video' && (
            <div className="global-call-video-stage">
              <div className={`global-call-remote-grid tile-count-${Math.min(callControls.remoteVideoTiles?.length || 0, 4)}`}>
                {(callControls.remoteVideoTiles || []).length > 0 ? (
                  callControls.remoteVideoTiles.map((tile, index) => (
                    <video
                      key={tile.tileId}
                      ref={(element) => callControls.setRemoteVideoElement?.(tile.tileId, element)}
                      className="global-remote-video"
                      autoPlay
                      playsInline
                      aria-label={`remote video ${index + 1}`}
                    />
                  ))
                ) : (
                  <div className="global-remote-video-placeholder">Dang cho camera</div>
                )}
              </div>
              <video ref={callControls.localVideoRef} className="global-local-video" autoPlay muted playsInline />
            </div>
          )}
          <div className="global-active-call-info">
            <strong>{resolveCallTitle(activeCall)}</strong>
            <span className={callControls.callPhase === 'ringing' ? 'call-status-waiting' : ''}>
              {callControls.callPhase === 'ringing'
                ? 'Đang đổ chuông...'
                : callControls.callPhase === 'active'
                  ? `Đang trong cuộc gọi - ${callControls.activeDurationLabel || '00:00'}`
                  : 'Đang kết nối...'}
            </span>
          </div>
          <div className="global-active-call-actions">
            <button type="button" onClick={callControls.toggleMute} title="Tắt/bật micro">
              {callControls.isMuted ? <FiMicOff /> : <FiMic />}
            </button>
            {activeCall.callType === 'video' && (
              <button type="button" onClick={callControls.toggleVideo} title="Tắt/bật camera">
                {callControls.isVideoEnabled ? <FiVideo /> : <FiVideoOff />}
              </button>
            )}
            <button type="button" className="global-call-decline" onClick={callControls.endCall} title="Kết thúc">
              <FiPhoneOff />
            </button>
          </div>
        </div>
      )}

      <NewConversationModal
        isOpen={showNewConversationModal}
        onClose={() => setShowNewConversationModal(false)}
        currentUserId={user?._id || user?.userId}
        onStartConversation={handleStartConversationWithUser}
        onPendingRequestsCountChange={setFriendRequestCount}
      />

      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        currentUserId={user?._id || user?.userId}
        onCreateGroup={handleCreateGroupConversation}
      />
    </div>
  )
}

export default ChatPage
