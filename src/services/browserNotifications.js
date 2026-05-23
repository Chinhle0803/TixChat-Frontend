import { normalizeId } from '../utils/normalize.js'

const CONVERSATION_PREFERENCES_STORAGE_KEY = 'tixchat.conversationPreferences.v1'

const truncate = (value = '', maxLength = 110) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trim()}...`
}

const getDisplayName = (participant) => {
  if (!participant || typeof participant === 'string') return 'TixChat'
  return (
    participant.nickname ||
    participant.displayName ||
    participant.fullName ||
    participant.name ||
    participant.username ||
    'TixChat'
  )
}

export const readConversationPreferences = () => {
  if (typeof localStorage === 'undefined') return {}

  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATION_PREFERENCES_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (_) {
    return {}
  }
}

export const isConversationMuted = (conversationId) => {
  const normalizedConversationId = normalizeId(conversationId)
  if (!normalizedConversationId) return false
  return Boolean(readConversationPreferences()?.[normalizedConversationId]?.muted)
}

export const isBrowserNotificationSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window

export const requestBrowserNotificationPermission = async () => {
  if (!isBrowserNotificationSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

export const buildMessagePreview = (message = {}) => {
  const type = String(message?.type || '').toLowerCase()
  const content = String(message?.content || '').trim()
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []

  if (type === 'system') return truncate(content || 'Có cập nhật mới')
  if (content) return truncate(content)
  if (attachments.length > 0) {
    const firstType = String(attachments[0]?.type || attachments[0]?.mimeType || '').toLowerCase()
    if (firstType.includes('image')) return 'Đã gửi một ảnh'
    if (firstType.includes('video')) return 'Đã gửi một video'
    return 'Đã gửi một tệp'
  }
  return 'Bạn có tin nhắn mới'
}

export const buildMessageNotification = ({ message, conversation }) => {
  const senderId = normalizeId(message?.senderId)
  const participants = Array.isArray(conversation?.participants) ? conversation.participants : []
  const sender = participants.find((participant) => {
    const participantId = normalizeId(participant?._id || participant?.userId || participant?.id || participant)
    return participantId && participantId === senderId
  })
  const senderName = senderId === 'system' ? 'TixChat' : getDisplayName(sender)
  const isGroup = String(conversation?.type || '').toLowerCase() === 'group'
  const title = isGroup ? (conversation?.name || 'Nhóm chat') : senderName
  const preview = buildMessagePreview(message)

  return {
    title,
    body: isGroup && senderId !== 'system' ? `${senderName}: ${preview}` : preview,
    data: {
      type: 'message',
      conversationId: normalizeId(message?.conversationId || conversation?.conversationId || conversation?._id),
      messageId: normalizeId(message?.messageId || message?._id),
    },
  }
}

export const notifyIncomingMessage = async ({ message, conversation, onClick }) => {
  if (!isBrowserNotificationSupported()) return null
  const permission = await requestBrowserNotificationPermission()
  if (permission !== 'granted') return null

  const notificationPayload = buildMessageNotification({ message, conversation })
  if (!notificationPayload?.data?.conversationId) return null

  const notification = new Notification(notificationPayload.title, {
    body: notificationPayload.body,
    tag: notificationPayload.data.messageId || notificationPayload.data.conversationId,
    data: notificationPayload.data,
  })

  notification.onclick = () => {
    window.focus?.()
    onClick?.(notificationPayload.data)
    notification.close()
  }

  return notification
}
