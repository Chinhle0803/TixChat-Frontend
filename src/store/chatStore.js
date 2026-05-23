import { create } from 'zustand'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || value.messageId || '')
  }
  return String(value)
}

const useChatStore = create((set) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  onlineUsers: [],
  typingUsers: {},
  unreadByConversation: {},
  friendRequestCount: 0,

  setConversations: (conversations) => set({ conversations }),

  setCurrentConversation: (conversation) => set({ currentConversation: conversation }),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => {
      // Check if message already exists (by messageId or _id)
      const messageId = normalizeId(message._id || message.messageId)
      const existsById = state.messages.some((msg) => {
        const msgId = normalizeId(msg._id || msg.messageId)
        return msgId === messageId
      })

      if (existsById) {
        return { messages: state.messages }
      }

      const incomingClientMessageId = normalizeId(message?.clientMessageId)
      if (incomingClientMessageId) {
        const existsByClientMessageId = state.messages.some((msg) =>
          normalizeId(msg?.clientMessageId) === incomingClientMessageId
        )

        if (existsByClientMessageId) {
          return {
            messages: state.messages.map((msg) => {
              if (normalizeId(msg?.clientMessageId) !== incomingClientMessageId) {
                return msg
              }

              return {
                ...msg,
                ...message,
                _id: message._id || message.messageId || msg._id,
                messageId: message.messageId || message._id || msg.messageId,
                status: message.status || 'sent',
                isOptimistic: false,
              }
            }),
          }
        }
      }
      
      return { messages: [message, ...state.messages] }
    }),

  updateMessage: (messageId, updatedMessage) =>
    set((state) => ({
      messages: state.messages.map((msg) => {
        const msgId = normalizeId(msg._id || msg.messageId)
        return msgId === normalizeId(messageId) ? { ...msg, ...updatedMessage } : msg
      }),
    })),

  deleteMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.map((msg) => {
        const msgId = normalizeId(msg._id || msg.messageId)
        if (msgId !== normalizeId(messageId)) return msg
        return { ...msg, isDeleted: true }
      }),
    })),

  /**
   * Mark message as globally deleted (Gỡ) — sets isDeleted: true for everyone
   */
  markMessageGloballyDeleted: (messageId) =>
    set((state) => ({
      messages: state.messages.map((msg) => {
        const msgId = normalizeId(msg._id || msg.messageId)
        if (msgId !== normalizeId(messageId)) return msg
        return { ...msg, isDeleted: true }
      }),
    })),

  /**
   * Mark message as deleted by the current user (Xóa) — adds userId to deletedBy map
   */
  markMessageDeletedByMe: (messageId, userId) =>
    set((state) => ({
      messages: state.messages.map((msg) => {
        const msgId = normalizeId(msg._id || msg.messageId)
        if (msgId !== normalizeId(messageId)) return msg
        return {
          ...msg,
          deletedBy: { ...(msg.deletedBy || {}), [userId]: Date.now() },
        }
      }),
    })),

  setOnlineUsers: (users) => set({ onlineUsers: users }),

  addOnlineUser: (userId) =>
    set((state) => ({
      onlineUsers: state.onlineUsers.find((u) => u._id === userId)
        ? state.onlineUsers
        : [...state.onlineUsers, { _id: userId }],
    })),

  removeOnlineUser: (userId) =>
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u._id !== userId),
    })),

  setTypingUser: (conversationId, userId, isTyping) =>
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: {
          ...(state.typingUsers[conversationId] || {}),
          [userId]: isTyping,
        },
      },
    })),

  markConversationSeenByUser: (conversationId, userId) =>
    set((state) => ({
      messages: state.messages.map((message) => {
        const messageConversationId = normalizeId(message?.conversationId)
        if (messageConversationId !== normalizeId(conversationId)) {
          return message
        }

        const currentSeenBy = Array.isArray(message?.seenBy) ? message.seenBy : []
        if (currentSeenBy.includes(userId)) {
          return message
        }

        return {
          ...message,
          seenBy: [...currentSeenBy, userId],
        }
      }),
    })),

  setUnreadCounts: (counts) => set({ unreadByConversation: counts || {} }),

  setConversationUnreadCount: (conversationId, count) =>
    set((state) => ({
      unreadByConversation: {
        ...state.unreadByConversation,
        [conversationId]: Math.max(0, Number(count) || 0),
      },
    })),

  incrementConversationUnread: (conversationId) =>
    set((state) => ({
      unreadByConversation: {
        ...state.unreadByConversation,
        [conversationId]: (Number(state.unreadByConversation?.[conversationId]) || 0) + 1,
      },
    })),

  clearConversationUnread: (conversationId) =>
    set((state) => ({
      unreadByConversation: {
        ...state.unreadByConversation,
        [conversationId]: 0,
      },
    })),

  removeConversationById: (conversationId) =>
    set((state) => {
      const targetId = normalizeId(conversationId)
      if (!targetId) {
        return state
      }

      const nextConversations = (state.conversations || []).filter((conversation) => {
        const id = normalizeId(conversation?._id || conversation?.conversationId)
        return id !== targetId
      })

      const nextUnreadByConversation = { ...(state.unreadByConversation || {}) }
      delete nextUnreadByConversation[targetId]

      const currentConversationId = normalizeId(
        state.currentConversation?._id || state.currentConversation?.conversationId
      )

      const isRemovingCurrent = currentConversationId === targetId

      return {
        conversations: nextConversations,
        unreadByConversation: nextUnreadByConversation,
        currentConversation: isRemovingCurrent ? null : state.currentConversation,
        messages: isRemovingCurrent ? [] : state.messages,
      }
    }),

  setFriendRequestCount: (count) =>
    set({ friendRequestCount: Math.max(0, Number(count) || 0) }),

  incrementFriendRequestCount: () =>
    set((state) => ({ friendRequestCount: (state.friendRequestCount || 0) + 1 })),

  decrementFriendRequestCount: () =>
    set((state) => ({ friendRequestCount: Math.max(0, (state.friendRequestCount || 0) - 1) })),
}))

export default useChatStore
