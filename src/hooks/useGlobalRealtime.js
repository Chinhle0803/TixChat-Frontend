import { useEffect, useRef } from 'react'
import { buildMessageNotification, isConversationMuted } from '../services/browserNotifications'
import { getSocket, initSocket } from '../services/socket'
import { normalizeId } from '../utils/normalize'
import useAuthStore from '../store/authStore'
import useChatStore from '../store/chatStore'
import useSocket from './useSocket'
import { useRealtimeUiStore } from '../store/realtimeUiStore'

const PROCESSED_MESSAGE_LIMIT = 400

const getMessageKey = (message = {}) =>
  normalizeId(message?._id || message?.messageId || message?.clientMessageId)

const rememberProcessedMessage = (cacheRef, orderRef, key) => {
  if (!key) return false
  if (cacheRef.current.has(key)) return true

  cacheRef.current.add(key)
  orderRef.current.push(key)

  while (orderRef.current.length > PROCESSED_MESSAGE_LIMIT) {
    const oldestKey = orderRef.current.shift()
    cacheRef.current.delete(oldestKey)
  }

  return false
}

const resolveCallTitle = ({ call, conversations, currentUserId }) => {
  const conversationId = normalizeId(call?.conversationId)
  const matchedConversation = (conversations || []).find((conversation) => {
    const id = normalizeId(conversation?._id || conversation?.conversationId)
    return id === conversationId
  })

  if (!matchedConversation) return 'Cuộc gọi TixChat'
  if (String(matchedConversation?.type || '').toLowerCase() === 'group') {
    return matchedConversation?.name || 'Nhóm chat'
  }

  const counterpart = (matchedConversation?.participants || []).find((participant) => {
    const participantId = normalizeId(participant?._id || participant?.userId || participant?.id || participant)
    return participantId && participantId !== currentUserId
  })

  if (counterpart && typeof counterpart === 'object') {
    return (
      counterpart?.nickname ||
      counterpart?.displayName ||
      counterpart?.fullName ||
      counterpart?.name ||
      counterpart?.username ||
      'Người dùng'
    )
  }

  return matchedConversation?.name || 'Người dùng'
}

export const useGlobalRealtime = ({ currentPath = '/', callControls = null } = {}) => {
  useSocket()

  const user = useAuthStore((state) => state.user)
  const currentUserId = normalizeId(user?._id || user?.userId)
  const currentConversation = useChatStore((state) => state.currentConversation)
  const conversations = useChatStore((state) => state.conversations)
  const upsertBanner = useRealtimeUiStore((state) => state.upsertBanner)
  const dismissMatching = useRealtimeUiStore((state) => state.dismissMatching)

  const currentUserIdRef = useRef('')
  const currentConversationIdRef = useRef('')
  const currentPathRef = useRef(currentPath)
  const conversationsRef = useRef(conversations)
  const processedMessageIdsRef = useRef(new Set())
  const processedMessageOrderRef = useRef([])

  useEffect(() => {
    currentUserIdRef.current = currentUserId
  }, [currentUserId])

  useEffect(() => {
    currentConversationIdRef.current = normalizeId(
      currentConversation?._id || currentConversation?.conversationId
    )
  }, [currentConversation])

  useEffect(() => {
    currentPathRef.current = currentPath
  }, [currentPath])

  useEffect(() => {
    conversationsRef.current = Array.isArray(conversations) ? conversations : []
  }, [conversations])

  useEffect(() => {
    if (!currentUserId) return undefined

    const socket = getSocket() || initSocket()
    if (!socket) return undefined

    const handleIncomingMessage = (payload) => {
      const message = payload?.message
      const messageId = getMessageKey(message)
      const conversationId = normalizeId(message?.conversationId)
      const senderId = normalizeId(message?.senderId)
      if (!conversationId || !senderId || senderId === currentUserIdRef.current) return
      if (rememberProcessedMessage(processedMessageIdsRef, processedMessageOrderRef, messageId)) return
      if (isConversationMuted(conversationId)) return

      const viewingCurrentConversation =
        currentPathRef.current.startsWith('/chat') &&
        normalizeId(currentConversationIdRef.current) === conversationId

      if (viewingCurrentConversation) return

      const matchedConversation = conversationsRef.current.find((conversation) => {
        const id = normalizeId(conversation?._id || conversation?.conversationId)
        return id === conversationId
      })

      const notification = buildMessageNotification({
        message,
        conversation: matchedConversation || { _id: conversationId, conversationId },
      })

      if (!notification?.data?.conversationId) return

      upsertBanner({
        id: `message-${notification.data.messageId || notification.data.conversationId}`,
        type: 'message',
        title: notification.title,
        body: notification.body,
        data: notification.data,
        persistent: false,
        expiresAt: Date.now() + 5000,
      })
    }

    socket.on('message:received', handleIncomingMessage)

    return () => {
      socket.off('message:received', handleIncomingMessage)
    }
  }, [currentUserId, upsertBanner])

  useEffect(() => {
    const call = callControls?.incomingCall
    const callConversationId = normalizeId(call?.conversationId)
    const isViewingIncomingCallConversation =
      currentPath === '/chat' &&
      callConversationId &&
      callConversationId === normalizeId(currentConversationIdRef.current)

    if (!call?.callId || isViewingIncomingCallConversation) {
      dismissMatching((banner) => banner.type === 'call' && banner?.data?.action !== 'join')
      return
    }

    const title = resolveCallTitle({
      call,
      conversations,
      currentUserId,
    })

    upsertBanner({
      id: `call-${normalizeId(call?.callId)}`,
      type: 'call',
      title,
      body: `Cuộc gọi ${String(call?.callType || '').toLowerCase() === 'video' ? 'video' : 'thoại'} đến`,
      data: {
        type: 'call',
        callId: normalizeId(call?.callId),
        conversationId: callConversationId,
      },
      persistent: true,
    })
  }, [callControls?.incomingCall, conversations, currentPath, currentUserId, dismissMatching, upsertBanner])

  useEffect(() => {
    const call = callControls?.availableGroupCall
    const callConversationId = normalizeId(call?.conversationId)
    const isViewingCallConversation =
      currentPath === '/chat' &&
      callConversationId &&
      callConversationId === normalizeId(currentConversationIdRef.current)

    if (!call?.callId || isViewingCallConversation) {
      dismissMatching((banner) => banner.type === 'call' && banner?.data?.action === 'join')
      return
    }

    const title = resolveCallTitle({
      call,
      conversations,
      currentUserId,
    })

    upsertBanner({
      id: `group-call-${normalizeId(call?.callId)}`,
      type: 'call',
      title,
      body: 'Cuộc gọi nhóm đang diễn ra',
      data: {
        type: 'call',
        action: 'join',
        callId: normalizeId(call?.callId),
        conversationId: callConversationId,
      },
      persistent: true,
    })
  }, [callControls?.availableGroupCall, conversations, currentPath, currentUserId, dismissMatching, upsertBanner])
}

export default useGlobalRealtime
