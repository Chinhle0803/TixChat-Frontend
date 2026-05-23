import { createSocketCore } from './socketCore.js'
import { normalizeId } from '../utils/normalize.js'
import useAuthStore from '../store/authStore'
import useChatStore from '../store/chatStore'
import { conversationService } from './api'
import { isConversationMuted, notifyIncomingMessage } from './browserNotifications.js'
import { isNgrokUrl, resolveSocketBaseUrl } from '../utils/runtimeUrl.js'

const SOCKET_URL = resolveSocketBaseUrl(import.meta.env.VITE_SOCKET_URL)
const socketTransports = isNgrokUrl(SOCKET_URL) ? ['websocket'] : undefined

let socket = null
let socketCore = null
let listenersBound = false
const processedIncomingMessageKeys = new Set()
const processedIncomingMessageOrder = []
const PROCESSED_INCOMING_MESSAGE_LIMIT = 500

const getIncomingMessageKey = (message) =>
  normalizeId(message?._id || message?.messageId || message?.clientMessageId)

const rememberIncomingMessageKey = (key) => {
  if (!key) return false
  if (processedIncomingMessageKeys.has(key)) return true

  processedIncomingMessageKeys.add(key)
  processedIncomingMessageOrder.push(key)

  while (processedIncomingMessageOrder.length > PROCESSED_INCOMING_MESSAGE_LIMIT) {
    const oldestKey = processedIncomingMessageOrder.shift()
    processedIncomingMessageKeys.delete(oldestKey)
  }

  return false
}

export const initSocket = () => {
  const { accessToken } = useAuthStore.getState()

  if (!accessToken) {
    console.error('No auth token found')
    return null
  }

  if (!socketCore) {
    socketCore = createSocketCore({
      socketUrl: SOCKET_URL,
      getAccessToken: () => useAuthStore.getState()?.accessToken,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: socketTransports,
    })
  }

  socket = socketCore.connect()

  if (socket && socket.auth?.token !== accessToken) {
    socket.auth = {
      ...(socket.auth || {}),
      token: accessToken,
    }
    if (!socket.connected) {
      socket.connect()
    }
  }

  // Always set up listeners - they will be re-attached on each connect
  listenersBound = false
  setupSocketListeners(socket)

  return socket
}

export const setupSocketListeners = (socket) => {
  if (!socket) {
    return
  }

  // Only bind listeners once per socket instance unless it's a fresh connection
  // Use the socket id to detect if it's the same connection
  if (socket.__tixchatListenersBound && socket.__tixchatSocketId === socket.id) {
    return
  }

  // Mark this socket as having listeners bound
  socket.__tixchatListenersBound = true
  socket.__tixchatSocketId = socket.id
  listenersBound = true

  // Connection events
  socket.on('connect', () => {
    console.log('✅ Connected to socket server')
    socket.__tixchatSocketId = socket.id
  })

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from socket server')
  })

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error)
  })

  // Message events
  const handleIncomingMessage = async (data) => {
    const message = data?.message
    const messageConvId = normalizeId(message?.conversationId)
    if (!messageConvId) return

    const messageKey = getIncomingMessageKey(message)
    if (rememberIncomingMessageKey(messageKey)) return

    // Only append to message list if this conversation is currently open
    const {
      currentConversation,
      conversations,
      unreadByConversation,
      setConversations,
      incrementConversationUnread,
      clearConversationUnread,
    } = useChatStore.getState()
    const currentUserId = normalizeId(
      useAuthStore.getState()?.user?._id || useAuthStore.getState()?.user?.userId
    )
    const senderId = normalizeId(message?.senderId)
    const currentConvId = normalizeId(currentConversation?._id || currentConversation?.conversationId)
    
    const isCurrentConversation = messageConvId === currentConvId
    const isOwnMessage = senderId && senderId === currentUserId

    if (isCurrentConversation) {
      useChatStore.getState().addMessage(message)
      if (!isOwnMessage) {
        clearConversationUnread(messageConvId)
        markAsSeen(messageConvId)
      }
    } else if (!isOwnMessage) {
      incrementConversationUnread(messageConvId)
    }

    // Always upsert conversation preview so unopened chats still appear/update
    let targetConversation = (conversations || []).find((conversation) => {
      const id = normalizeId(conversation?._id || conversation?.conversationId)
      return id === messageConvId
    })

    if (!targetConversation) {
      try {
        const response = await conversationService.getConversation(messageConvId)
        targetConversation = response?.data?.conversation || null
      } catch (error) {
        console.warn('⚠️ Failed to fetch conversation details for incoming message:', error?.message || error)
      }
    }

    const fallbackConversation = {
      _id: messageConvId,
      conversationId: messageConvId,
      type: '1-1',
      participants: [message?.senderId].filter(Boolean),
    }

    const updatedConversation = {
      ...(targetConversation || fallbackConversation),
      latestMessage: message,
      unreadCount: isCurrentConversation
        ? 0
        : isOwnMessage
          ? Number(unreadByConversation?.[messageConvId] || targetConversation?.unreadCount || 0)
          : Number(unreadByConversation?.[messageConvId] || targetConversation?.unreadCount || 0) + 1,
      lastMessageAt: message?.createdAt || message?.updatedAt || Date.now(),
      updatedAt: message?.createdAt || message?.updatedAt || Date.now(),
    }

    const nextConversations = (conversations || [])
      .filter((conversation) => {
        const id = normalizeId(conversation?._id || conversation?.conversationId)
        return id !== messageConvId
      })
      .concat(updatedConversation)
      .sort((a, b) => {
        const timeA = Number(a?.lastMessageAt || a?.updatedAt || 0)
        const timeB = Number(b?.lastMessageAt || b?.updatedAt || 0)
        return timeB - timeA
      })

    setConversations(nextConversations)

    if (!isCurrentConversation && !isOwnMessage && !isConversationMuted(messageConvId)) {
      notifyIncomingMessage({
        message,
        conversation: updatedConversation,
        onClick: ({ conversationId }) => {
          window.dispatchEvent(new CustomEvent('tixchat:open-conversation', {
            detail: { conversationId },
          }))
        },
      }).catch((error) => {
        console.warn('Cannot show browser notification:', error?.message || error)
      })
    }
  }

  socket.on('message:received', handleIncomingMessage)
  socket.on('message:sent', handleIncomingMessage)

  socket.on('message:delivered', (data) => {
    useChatStore.getState().updateMessage(data.messageId, { status: 'delivered' })
  })

  socket.on('message:seen', (data) => {
    useChatStore
      .getState()
      .markConversationSeenByUser(data.conversationId, data.userId)
  })

  socket.on('message:edited', (data) => {
    const messageId = data.message?._id || data.message?.messageId || data.messageId
    if (!messageId) return

    if (data.message) {
      useChatStore.getState().updateMessage(messageId, data.message)
      return
    }

    useChatStore.getState().updateMessage(messageId, {
      content: data.content,
      metadata: data.metadata,
      isEdited: data.isEdited ?? true,
      editedAt: data.editedAt || Date.now(),
    })
  })

  socket.on('message:deleted', (data) => {
    if (!data?.messageId) return

    if (data.isDeleted) {
      // Global delete (Gỡ) — everyone hides the message
      useChatStore.getState().markMessageGloballyDeleted(data.messageId)
    }
  })

  socket.on('message:hidden', (data) => {
    if (!data?.messageId) return

    const currentUserId = normalizeId(
      useAuthStore.getState()?.user?._id || useAuthStore.getState()?.user?.userId
    )
    const hiddenByUserId = normalizeId(data.hiddenBy)

    if (hiddenByUserId === currentUserId) {
      // This user deleted the message — hide it for them only (Xóa)
      useChatStore.getState().markMessageDeletedByMe(data.messageId, currentUserId)
    }
    // If a different user deleted for themselves, do nothing — the message stays visible
  })

  socket.on('message:emoji', (data) => {
    const messageId = data.message?._id || data.message?.messageId
    if (!messageId) return

    useChatStore.getState().updateMessage(messageId, {
      reactions: data.message.reactions || {},
    })
  })

  // Typing events
  socket.on('typing:start', (data) => {
    useChatStore.getState().setTypingUser(data.conversationId, data.userId, true)
  })

  socket.on('typing:stop', (data) => {
    useChatStore.getState().setTypingUser(data.conversationId, data.userId, false)
  })

  // Presence events
  socket.on('user:online', (data) => {
    useChatStore.getState().addOnlineUser(data.userId)
  })

  socket.on('user:offline', (data) => {
    useChatStore.getState().removeOnlineUser(data.userId)
  })

  socket.on('user:presence', (data) => {
    // Handle presence changes (online, away, offline)
    console.log(`User ${data.userId} is ${data.status}`)
  })

  // Participant events
  socket.on('participant:added', async (data) => {
    const conversationId = normalizeId(data?.conversationId)
    if (!conversationId) {
      console.log('Participant added:', data?.participantId)
      return
    }

    const { conversations, setConversations } = useChatStore.getState()

    const existingConversation = (conversations || []).find((conversation) => {
      const id = normalizeId(conversation?._id || conversation?.conversationId)
      return id === conversationId
    })

    if (existingConversation) {
      return
    }

    let fetchedConversation = null
    try {
      const response = await conversationService.getConversation(conversationId)
      fetchedConversation = response?.data?.conversation || null
    } catch (error) {
      console.warn('⚠️ Failed to fetch conversation after participant added:', error?.message || error)
      return
    }

    const nextConversation = {
      ...fetchedConversation,
      _id: normalizeId(fetchedConversation?._id || fetchedConversation?.conversationId) || conversationId,
      conversationId,
      unreadCount: Number(fetchedConversation?.unreadCount || 0),
      lastMessageAt:
        fetchedConversation?.lastMessageAt ||
        fetchedConversation?.updatedAt ||
        fetchedConversation?.createdAt ||
        Date.now(),
    }

    const nextConversations = (conversations || [])
      .filter((conversation) => {
        const id = normalizeId(conversation?._id || conversation?.conversationId)
        return id !== conversationId
      })
      .concat(nextConversation)
      .sort((a, b) => {
        const timeA = Number(a?.lastMessageAt || a?.updatedAt || a?.createdAt || 0)
        const timeB = Number(b?.lastMessageAt || b?.updatedAt || b?.createdAt || 0)
        return timeB - timeA
      })

    setConversations(nextConversations)
  })

  socket.on('participant:removed', (data) => {
    console.log('Participant removed:', data.participantId)
  })

  socket.on('participant:role_updated', async (data) => {
    const conversationId = normalizeId(data?.conversationId)
    if (!conversationId) return

    const { currentConversation } = useChatStore.getState()
    const currentConversationId = normalizeId(currentConversation?._id || currentConversation?.conversationId)
    if (!currentConversationId || currentConversationId !== conversationId) {
      return
    }

    // Role system message is emitted from backend as real message and persisted in DB.
    // Keep this listener for role-change side effects if needed in the future.
  })

  socket.on('conversation:created', async (data) => {
    const conversationId = normalizeId(data?.conversationId)
    if (!conversationId) return

    const { conversations, setConversations } = useChatStore.getState()
    const existingConversation = (conversations || []).find((conversation) => {
      const id = normalizeId(conversation?._id || conversation?.conversationId)
      return id === conversationId
    })

    if (existingConversation) return

    let fetchedConversation = null
    try {
      const response = await conversationService.getConversation(conversationId)
      fetchedConversation = response?.data?.conversation || null
    } catch (error) {
      console.warn('⚠️ Failed to fetch newly created conversation:', error?.message || error)
    }

    const fallbackConversation = {
      _id: conversationId,
      conversationId,
      type: data?.type || 'group',
      participants: Array.isArray(data?.participants) ? data.participants : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastMessageAt: Date.now(),
      unreadCount: 0,
    }

    const nextConversation = {
      ...(fetchedConversation || fallbackConversation),
      _id: normalizeId(fetchedConversation?._id || fetchedConversation?.conversationId) || conversationId,
      conversationId,
      unreadCount: Number(fetchedConversation?.unreadCount || 0),
      lastMessageAt:
        fetchedConversation?.lastMessageAt ||
        fetchedConversation?.updatedAt ||
        fetchedConversation?.createdAt ||
        Date.now(),
    }

    const nextConversations = (conversations || [])
      .filter((conversation) => {
        const id = normalizeId(conversation?._id || conversation?.conversationId)
        return id !== conversationId
      })
      .concat(nextConversation)
      .sort((a, b) => {
        const timeA = Number(a?.lastMessageAt || a?.updatedAt || a?.createdAt || 0)
        const timeB = Number(b?.lastMessageAt || b?.updatedAt || b?.createdAt || 0)
        return timeB - timeA
      })

    setConversations(nextConversations)
  })

  socket.on('conversation:dissolved', async (data) => {
    const conversationId = normalizeId(data?.conversationId)
    if (!conversationId) return

    const {
      currentConversation,
      removeConversationById,
    } = useChatStore.getState()

    const currentConversationId = normalizeId(currentConversation?._id || currentConversation?.conversationId)

    if (currentConversationId === conversationId) {
      try {
        await leaveConversation(conversationId)
      } catch (error) {
        console.warn('⚠️ Failed to leave dissolved conversation room:', error?.message || error)
      }
    }

    removeConversationById(conversationId)
  })

  socket.on('friend_request:new', () => {
    useChatStore.getState().incrementFriendRequestCount()
  })

  socket.on('friend_request:accepted', () => {
    useChatStore.getState().decrementFriendRequestCount()
  })

  socket.on('friend_request:rejected', () => {
    useChatStore.getState().decrementFriendRequestCount()
  })

  // Error events
  socket.on('error', (data) => {
    console.error('Socket error:', data.message)
  })
}

export const getSocket = () => {
  if (!socket || !socket.connected) {
    return initSocket()
  }
  return socket
}

export const disconnectSocket = () => {
  if (socketCore) {
    socketCore.disconnect()
    socketCore = null
    socket = null
  }
}

export const ensureSocketConnected = () => {
  if (!socketCore) {
    initSocket()
  }

  if (!socketCore) {
    return Promise.reject(new Error('Failed to initialize socket'))
  }

  return socketCore.ensureConnected(10000)
}

export const joinConversation = (conversationId) => {
  if (!socketCore) {
    initSocket()
  }

  if (!socketCore) {
    return Promise.reject(new Error('Socket not connected'))
  }

  return socketCore.joinConversation(conversationId, 5000).then((response) => {
    console.log(`✅ Successfully joined conversation: ${conversationId}`)
    return response
  })
}

export const leaveConversation = (conversationId) => {
  if (!socketCore) {
    initSocket()
  }

  if (!socketCore) {
    return Promise.reject(new Error('Socket not connected'))
  }

  return socketCore.leaveConversation(conversationId, 5000).then((response) => {
    console.log(`👋 Successfully left conversation: ${conversationId}`)
    return response
  })
}

export const sendMessage = (conversationId, content, replyTo = null) => {
  return new Promise((resolve, reject) => {
    const s = getSocket()
    if (!s?.connected) {
      reject(new Error('Socket not connected'))
      return
    }
    
    s.emit('send_message', { conversationId, content, replyTo }, (response) => {
      if (response?.success) {
        console.log('✅ Message sent successfully:', response.message)
        resolve(response)
      } else {
        reject(new Error(response?.error || 'Failed to send message'))
      }
    })
    
    // Timeout after 10 seconds
    setTimeout(() => {
      reject(new Error('Send message timeout'))
    }, 10000)
  })
}

export const startTyping = (conversationId) => {
  if (!socketCore) {
    initSocket()
  }

  if (socketCore) {
    socketCore.emit('typing:start', { conversationId }).catch(() => {})
  }
}

export const stopTyping = (conversationId) => {
  if (!socketCore) {
    initSocket()
  }

  if (socketCore) {
    socketCore.emit('typing:stop', { conversationId }).catch(() => {})
  }
}

export const markAsDelivered = (messageId) => {
  const s = getSocket()
  if (s) {
    s.emit('message:delivered', { messageId })
  }
}

export const markAsSeen = (conversationId) => {
  const s = getSocket()
  if (s) {
    s.emit('message:seen', { conversationId })
  }
}

export const editMessage = (messageId, content) => {
  const s = getSocket()
  if (s) {
    s.emit('message:edit', { messageId, content })
  }
}

export const deleteMessage = (messageId) => {
  const s = getSocket()
  if (s) {
    s.emit('message:delete', { messageId })
  }
}

export const addEmoji = (messageId, emoji) => {
  const s = getSocket()
  if (s) {
    s.emit('message:emoji', { messageId, emoji })
  }
}

export const setPresence = (status) => {
  const s = getSocket()
  if (s) {
    s.emit('set_presence', { status })
  }
}

export default {
  initSocket,
  getSocket,
  disconnectSocket,
  ensureSocketConnected,
  joinConversation,
  leaveConversation,
  sendMessage,
  startTyping,
  stopTyping,
  markAsDelivered,
  markAsSeen,
  editMessage,
  deleteMessage,
  addEmoji,
  setPresence,
}
