import { useState, useCallback, useRef } from 'react'
import { messageService, conversationService } from '../services/api'
import {
  joinConversation,
  leaveConversation as leaveConversationSocket,
  ensureSocketConnected,
  startTyping as startTypingSocket,
  stopTyping as stopTypingSocket,
  markAsSeen as markAsSeenSocket,
} from '../services/socket'
import useChatStore from '../store/chatStore'
import useAuthStore from '../store/authStore'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || '')
  }
  return String(value)
}

const createClientMessageId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const createTempMessageId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useChat = () => {
  const [loading, setLoading] = useState(false)
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false)
  const [messageCursor, setMessageCursor] = useState(null)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [error, setError] = useState(null)
  const inFlightSendKeysRef = useRef(new Set())
  const conversations = useChatStore((state) => state.conversations)
  const currentConversation = useChatStore((state) => state.currentConversation)
  const messages = useChatStore((state) => state.messages)
  const setConversations = useChatStore((state) => state.setConversations)
  const setCurrentConversation = useChatStore((state) => state.setCurrentConversation)
  const setMessages = useChatStore((state) => state.setMessages)
  const addMessage = useChatStore((state) => state.addMessage)
  const updateMessage = useChatStore((state) => state.updateMessage)
  const removeMessage = useChatStore((state) => state.deleteMessage)
  const markGloballyDeleted = useChatStore((state) => state.markMessageGloballyDeleted)
  const markDeletedByMe = useChatStore((state) => state.markMessageDeletedByMe)
  const setUnreadCounts = useChatStore((state) => state.setUnreadCounts)
  const clearConversationUnread = useChatStore((state) => state.clearConversationUnread)
  const user = useAuthStore((state) => state.user)

  const getConversations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [response, unreadResponse] = await Promise.all([
        conversationService.getConversations(),
        messageService.getUnreadCounts(),
      ])

      const conversationsList = response.data.conversations || []
      const unreadByConversation = unreadResponse?.data?.unreadByConversation || {}
      setUnreadCounts(unreadByConversation)

      const normalizedConversations = conversationsList.map((conversation) => {
        const conversationId = conversation?._id || conversation?.conversationId
        if (!conversationId) return conversation

        const latestMessage = conversation?.latestMessage || null

        return {
          ...conversation,
          unreadCount: Number(unreadByConversation?.[conversationId] || conversation?.unreadCount || 0),
          lastMessageAt:
            latestMessage?.createdAt ||
            latestMessage?.updatedAt ||
            conversation?.lastMessageAt ||
            conversation?.updatedAt,
        }
      })

      setConversations(normalizedConversations)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }, [setConversations, setUnreadCounts])

  const openConversation = useCallback(
    async (conversationId) => {
      setLoading(true)
      setLoadingMoreMessages(false)
      setMessageCursor(null)
      setHasMoreMessages(false)
      setError(null)
      try {
        // Fetch conversation data in parallel
        const [conversationResponse, messagesResponse] = await Promise.all([
          conversationService.getConversation(conversationId),
          messageService.getMessages(conversationId, 20)
        ])
        
        const conversation = conversationResponse.data.conversation
        const messagesList = messagesResponse.data.messages || []
        
        setCurrentConversation(conversation)
        
        // Ensure all messages have conversationId
        const enrichedMessages = messagesList.map(msg => ({
          ...msg,
          conversationId: conversationId,
          _id: msg._id || msg.messageId,
        }))
        
        setMessages(enrichedMessages)
        setMessageCursor(messagesResponse.data?.lastEvaluatedKey || null)
        setHasMoreMessages(Boolean(messagesResponse.data?.lastEvaluatedKey))
        
        try {
          await messageService.markAsSeen(conversationId)
          clearConversationUnread(conversationId)

          const nextConversations = conversations.map((conversationItem) => {
            const currentId = conversationItem._id || conversationItem.conversationId
            if (normalizeId(currentId) !== normalizeId(conversationId)) {
              return conversationItem
            }

            return {
              ...conversationItem,
              unreadCount: 0,
            }
          })
          setConversations(nextConversations)
        } catch (seenErr) {
          console.warn('⚠️ Failed to mark conversation as seen:', seenErr?.message || seenErr)
        }

        // Ensure socket is connected before joining room
        try {
          await ensureSocketConnected()
          await joinConversation(conversationId)
          markAsSeenSocket(conversationId)
        } catch (socketErr) {
          console.warn('⚠️ Socket join failed:', socketErr.message)
          // Continue anyway - user can still see messages but real-time won't work
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load conversation')
      } finally {
        setLoading(false)
      }
    },
    [clearConversationUnread, conversations, setConversations, setCurrentConversation, setMessages]
  )

  const createConversation = useCallback(
    async (type, participantIds, name = null) => {
      setError(null)
      try {
        const response = await conversationService.createConversation(
          type,
          participantIds,
          name
        )
        const createdConversation = response.data.conversation || {}
        const createdConversationId = createdConversation?._id || createdConversation?.conversationId
        const currentUserId = normalizeId(user?._id || user?.userId)

        const normalizedParticipants = Array.isArray(createdConversation?.participants)
          ? createdConversation.participants
          : [
              currentUserId,
              ...(Array.isArray(participantIds) ? participantIds.map((id) => normalizeId(id)).filter(Boolean) : []),
            ]

        const normalizedConversation = {
          ...createdConversation,
          _id: createdConversationId || createdConversation?._id,
          conversationId: createdConversationId || createdConversation?.conversationId,
          type: createdConversation?.type || type,
          name:
            createdConversation?.name ||
            (type === 'group' && typeof name === 'string' && name.trim() ? name.trim() : ''),
          participants: normalizedParticipants,
          updatedAt: createdConversation?.updatedAt || Date.now(),
          createdAt: createdConversation?.createdAt || Date.now(),
          lastMessageAt:
            createdConversation?.lastMessageAt ||
            createdConversation?.updatedAt ||
            createdConversation?.createdAt ||
            Date.now(),
          latestMessage: createdConversation?.latestMessage || null,
          unreadCount: Number(createdConversation?.unreadCount || 0),
        }

        const currentList = Array.isArray(conversations) ? conversations : []
        const nextListWithoutDuplicate = currentList.filter((item) => {
          const existingId = normalizeId(item?._id || item?.conversationId)
          return existingId !== normalizeId(normalizedConversation?._id || normalizedConversation?.conversationId)
        })

        const nextConversations = [normalizedConversation, ...nextListWithoutDuplicate].sort((a, b) => {
          const timeA = Number(a?.lastMessageAt || a?.updatedAt || a?.createdAt || 0)
          const timeB = Number(b?.lastMessageAt || b?.updatedAt || b?.createdAt || 0)
          return timeB - timeA
        })

        setConversations(nextConversations)

        setCurrentConversation(normalizedConversation)
        return normalizedConversation
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to create conversation')
        throw err
      }
    },
    [conversations, setConversations, setCurrentConversation, user?._id, user?.userId]
  )

  const sendMessage = useCallback(
    async (content, replyTo = null, options = {}) => {
      if (!currentConversation) {
        setError('No conversation selected')
        return
      }

      const trimmedContent = typeof content === 'string' ? content.trim() : ''
      const replyKey = normalizeId(replyTo)
  const clientMessageId = options?.clientMessageId || createClientMessageId()
      const messageType = options?.type || 'text'
      const conversationId = currentConversation._id || currentConversation.conversationId
      const payloadDedupeKey = `${conversationId}:${trimmedContent}:${replyKey}`
      const idDedupeKey = clientMessageId ? `id:${clientMessageId}` : ''
  const tempMessageId = createTempMessageId()

      if (
        inFlightSendKeysRef.current.has(payloadDedupeKey) ||
        (idDedupeKey && inFlightSendKeysRef.current.has(idDedupeKey))
      ) {
        return
      }

      setError(null)
      inFlightSendKeysRef.current.add(payloadDedupeKey)
      if (idDedupeKey) {
        inFlightSendKeysRef.current.add(idDedupeKey)
      }

      const optimisticMessage = {
        _id: tempMessageId,
        messageId: tempMessageId,
        conversationId,
        senderId: user?._id || user?.userId,
        content: trimmedContent,
        replyTo: replyTo || null,
        type: messageType,
        attachments: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'sending',
        clientMessageId,
        isOptimistic: true,
      }

      addMessage(optimisticMessage)

      const optimisticConversationTs = optimisticMessage.createdAt
      const optimisticConversations = conversations
        .map((conversation) => {
          const currentId = conversation._id || conversation.conversationId
          if (normalizeId(currentId) !== normalizeId(conversationId)) {
            return conversation
          }

          return {
            ...conversation,
            latestMessage: optimisticMessage,
            lastMessageAt: optimisticConversationTs,
            updatedAt: optimisticConversationTs,
          }
        })
        .sort((a, b) => {
          const timeA = a.lastMessageAt || a.updatedAt || 0
          const timeB = b.lastMessageAt || b.updatedAt || 0
          return Number(timeB) - Number(timeA)
        })

      setConversations(optimisticConversations)

      try {
        // Make API request to send message
        const response = await messageService.sendMessage(
          conversationId,
          content,
          replyTo,
          { clientMessageId, type: messageType }
        )
        
        const message = response.data.data
        
        // Ensure message has conversationId for store operations
        const enrichedMessage = {
          ...message,
          conversationId: conversationId,
          _id: message._id || message.messageId,
          clientMessageId,
          isOptimistic: false,
        }
        
        // Add message to local state immediately (optimistic update)
        addMessage(enrichedMessage)

        const nextConversations = conversations
          .map((conversation) => {
            const currentId = conversation._id || conversation.conversationId
            if (normalizeId(currentId) !== normalizeId(conversationId)) {
              return conversation
            }

            return {
              ...conversation,
              latestMessage: enrichedMessage,
              lastMessageAt:
                enrichedMessage.createdAt || enrichedMessage.updatedAt || conversation.lastMessageAt,
              updatedAt: Date.now(),
            }
          })
          .sort((a, b) => {
            const timeA = a.lastMessageAt || a.updatedAt || 0
            const timeB = b.lastMessageAt || b.updatedAt || 0
            return Number(timeB) - Number(timeA)
          })

        setConversations(nextConversations)
        
        // Emit socket event with callback to ensure delivery
        try {
          await ensureSocketConnected()
          await joinConversation(conversationId)
        } catch (err) {
          console.warn('⚠️ Socket sync failed:', err.message)
          // Continue anyway - message is already in database
        }
        
        return message
      } catch (err) {
        removeMessage(tempMessageId)

        setError(err.response?.data?.error || 'Failed to send message')
        throw err
      } finally {
        inFlightSendKeysRef.current.delete(payloadDedupeKey)
        if (idDedupeKey) {
          inFlightSendKeysRef.current.delete(idDedupeKey)
        }
      }
    },
    [currentConversation, addMessage, conversations, removeMessage, setConversations, user]
  )

  const sendAttachmentMessage = useCallback(
    async (file, content = '', replyTo = null, options = {}) => {
      if (!currentConversation) {
        setError('No conversation selected')
        return
      }

      if (!file) {
        setError('No attachment selected')
        return
      }

      setError(null)
      const conversationId = currentConversation._id || currentConversation.conversationId
  const clientMessageId = options?.clientMessageId || createClientMessageId()
      const payloadDedupeKey = `${conversationId}:attachment:${file?.name || ''}:${file?.size || 0}:${file?.lastModified || 0}:${normalizeId(replyTo)}:${(content || '').trim()}`
      const idDedupeKey = clientMessageId ? `id:${clientMessageId}` : ''
  const tempMessageId = createTempMessageId()

      if (
        inFlightSendKeysRef.current.has(payloadDedupeKey) ||
        (idDedupeKey && inFlightSendKeysRef.current.has(idDedupeKey))
      ) {
        return
      }

      inFlightSendKeysRef.current.add(payloadDedupeKey)
      if (idDedupeKey) {
        inFlightSendKeysRef.current.add(idDedupeKey)
      }

      const optimisticMessage = {
        _id: tempMessageId,
        messageId: tempMessageId,
        conversationId,
        senderId: user?._id || user?.userId,
        content: typeof content === 'string' ? content.trim() : '',
        replyTo: replyTo || null,
        type: 'file',
        attachments: [
          {
            name: file?.name || 'attachment',
            size: file?.size || 0,
            mimeType: file?.type || 'application/octet-stream',
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'sending',
        clientMessageId,
        isOptimistic: true,
      }

      addMessage(optimisticMessage)

      const optimisticConversationTs = optimisticMessage.createdAt
      const optimisticConversations = conversations
        .map((conversation) => {
          const currentId = conversation._id || conversation.conversationId
          if (normalizeId(currentId) !== normalizeId(conversationId)) {
            return conversation
          }

          return {
            ...conversation,
            latestMessage: optimisticMessage,
            lastMessageAt: optimisticConversationTs,
            updatedAt: optimisticConversationTs,
          }
        })
        .sort((a, b) => {
          const timeA = a.lastMessageAt || a.updatedAt || 0
          const timeB = b.lastMessageAt || b.updatedAt || 0
          return Number(timeB) - Number(timeA)
        })

      setConversations(optimisticConversations)

      try {
        const response = await messageService.sendAttachment(
          conversationId,
          file,
          content,
          replyTo,
          { clientMessageId }
        )

        const message = response.data.data
        const enrichedMessage = {
          ...message,
          conversationId,
          _id: message._id || message.messageId,
          clientMessageId,
          isOptimistic: false,
        }

        addMessage(enrichedMessage)

        const nextConversations = conversations
          .map((conversation) => {
            const currentId = conversation._id || conversation.conversationId
            if (normalizeId(currentId) !== normalizeId(conversationId)) {
              return conversation
            }

            return {
              ...conversation,
              latestMessage: enrichedMessage,
              lastMessageAt:
                enrichedMessage.createdAt || enrichedMessage.updatedAt || conversation.lastMessageAt,
              updatedAt: Date.now(),
            }
          })
          .sort((a, b) => {
            const timeA = a.lastMessageAt || a.updatedAt || 0
            const timeB = b.lastMessageAt || b.updatedAt || 0
            return Number(timeB) - Number(timeA)
          })

        setConversations(nextConversations)

        try {
          await ensureSocketConnected()
          await joinConversation(conversationId)
        } catch (err) {
          console.warn('⚠️ Socket sync failed:', err.message)
        }

        return message
      } catch (err) {
        removeMessage(tempMessageId)

        setError(err.response?.data?.error || 'Failed to send attachment')
        throw err
      } finally {
        inFlightSendKeysRef.current.delete(payloadDedupeKey)
        if (idDedupeKey) {
          inFlightSendKeysRef.current.delete(idDedupeKey)
        }
      }
    },
    [currentConversation, addMessage, conversations, removeMessage, setConversations, user]
  )

  const loadMoreMessages = useCallback(
    async () => {
      if (!currentConversation || !hasMoreMessages || loadingMoreMessages) return

      setError(null)
      setLoadingMoreMessages(true)
      try {
        const conversationId = currentConversation._id || currentConversation.conversationId
        const response = await messageService.getMessages(
          conversationId,
          20,
          messageCursor
        )
        const olderMessages = (response.data?.messages || []).map((msg) => ({
          ...msg,
          conversationId,
          _id: msg._id || msg.messageId,
        }))

        setMessages([...messages, ...olderMessages])
        setMessageCursor(response.data?.lastEvaluatedKey || null)
        setHasMoreMessages(Boolean(response.data?.lastEvaluatedKey))
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load messages')
      } finally {
        setLoadingMoreMessages(false)
      }
    },
    [currentConversation, hasMoreMessages, loadingMoreMessages, messageCursor, messages, setMessages]
  )

  const editMessage = useCallback(
    async (messageId, content) => {
      if (!currentConversation) {
        setError('No conversation selected')
        return
      }

      const trimmedContent = content?.trim()
      if (!trimmedContent) {
        throw new Error('Nội dung không được để trống')
      }

      setError(null)
      try {
        const conversationId = currentConversation._id || currentConversation.conversationId
        const response = await messageService.editMessage(conversationId, messageId, trimmedContent)
        const updatedMessage = response.data?.data

        updateMessage(messageId, {
          content: updatedMessage?.content || trimmedContent,
          isEdited: true,
          editedAt: updatedMessage?.editedAt || Date.now(),
        })

        return updatedMessage
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to edit message')
        throw err
      }
    },
    [currentConversation, updateMessage]
  )

  const deleteMessage = useCallback(
    async (messageId) => {
      if (!currentConversation) {
        setError('No conversation selected')
        return
      }

      const currentUserId = user?._id || user?.userId
      if (!currentUserId) return

      setError(null)
      try {
        const conversationId = currentConversation._id || currentConversation.conversationId
        await messageService.deleteMessage(conversationId, messageId)
        markDeletedByMe(messageId, currentUserId)
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete message')
        throw err
      }
    },
    [currentConversation, user, markDeletedByMe]
  )

  const toggleMessageReaction = useCallback(
    async (message, emoji) => {
      if (!currentConversation) {
        setError('No conversation selected')
        return
      }

      const messageId = message?._id || message?.messageId
      const currentUserId = normalizeId(user?._id || user?.userId)
      if (!messageId || !currentUserId) return

      const conversationId = currentConversation._id || currentConversation.conversationId
      const reactions = message.reactions || {}
      const usersByEmoji = reactions[emoji] || []
      const hasReacted = usersByEmoji.some((id) => normalizeId(id) === currentUserId)

      setError(null)
      try {
        if (hasReacted) {
          await messageService.removeEmoji(conversationId, messageId, emoji)
          const nextUsers = usersByEmoji.filter((id) => normalizeId(id) !== currentUserId)
          const nextReactions = { ...reactions }

          if (nextUsers.length > 0) {
            nextReactions[emoji] = nextUsers
          } else {
            delete nextReactions[emoji]
          }

          updateMessage(messageId, { reactions: nextReactions })
          return
        }

        await messageService.addEmoji(conversationId, messageId, emoji)
        updateMessage(messageId, {
          reactions: {
            ...reactions,
            [emoji]: [...usersByEmoji, currentUserId],
          },
        })
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to update reaction')
        throw err
      }
    },
    [currentConversation, updateMessage, user]
  )

  const leaveConversation = useCallback(() => {
    if (!currentConversation) return

    // Leave socket room
    const conversationId = currentConversation._id || currentConversation.conversationId
    leaveConversationSocket(conversationId).catch((err) => {
      console.warn('⚠️ Failed to leave conversation socket room:', err.message)
    })

    setCurrentConversation(null)
    setMessages([])
    setMessageCursor(null)
    setHasMoreMessages(false)
  }, [currentConversation])

  const deleteConversation = useCallback(
    async (conversationIdOverride = null) => {
      const conversationId =
        conversationIdOverride ||
        currentConversation?._id ||
        currentConversation?.conversationId

      if (!conversationId) {
        setError('No conversation selected')
        return
      }

      setError(null)
      try {
        await leaveConversationSocket(conversationId).catch((socketErr) => {
          console.warn('⚠️ Failed to leave conversation before delete:', socketErr?.message || socketErr)
        })

        await conversationService.deleteConversation(conversationId)

        const nextConversations = conversations.filter((conversation) => {
          const id = conversation._id || conversation.conversationId
          return normalizeId(id) !== normalizeId(conversationId)
        })

        setConversations(nextConversations)

        const currentConversationId =
          currentConversation?._id || currentConversation?.conversationId

        if (normalizeId(currentConversationId) === normalizeId(conversationId)) {
          setCurrentConversation(null)
          setMessages([])
          setMessageCursor(null)
          setHasMoreMessages(false)
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete conversation')
        throw err
      }
    },
    [
      conversations,
      currentConversation,
      setConversations,
      setCurrentConversation,
      setMessages,
    ]
  )

  const startTyping = useCallback(() => {
    const conversationId = currentConversation?._id || currentConversation?.conversationId
    if (!conversationId) return
    startTypingSocket(conversationId)
  }, [currentConversation])

  const stopTyping = useCallback(() => {
    const conversationId = currentConversation?._id || currentConversation?.conversationId
    if (!conversationId) return
    stopTypingSocket(conversationId)
  }, [currentConversation])

  const deleteMessageForAll = useCallback(
    async (messageId) => {
      if (!currentConversation) {
        setError('No conversation selected')
        return
      }

      setError(null)
      try {
        const conversationId = currentConversation._id || currentConversation.conversationId
        await messageService.deleteMessageForAll(conversationId, messageId)
        markGloballyDeleted(messageId)
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete message for all')
        throw err
      }
    },
    [currentConversation, markGloballyDeleted]
  )

  return {
    conversations,
    currentConversation,
    messages,
    loading,
  loadingMoreMessages,
  hasMoreMessages,
    error,
    getConversations,
    openConversation,
    leaveConversation,
  deleteConversation,
    createConversation,
    sendMessage,
  sendAttachmentMessage,
    loadMoreMessages,
    editMessage,
    deleteMessage,
    deleteMessageForAll,
    toggleMessageReaction,
    startTyping,
    stopTyping,
  }
}

export default useChat
