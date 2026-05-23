import React, { useState, useRef } from 'react'
import '../styles/Message.css'
// icons
import { FiCornerUpLeft, FiEdit2, FiShare2, FiTrash2 } from 'react-icons/fi'
import { FiPhone, FiVideo } from 'react-icons/fi'
import { MdDone, MdDoneAll } from 'react-icons/md'
import { FaRegSmile } from 'react-icons/fa'
import { CgMoreVertical } from 'react-icons/cg'
import { DEFAULT_EMOJI_REACTIONS } from '../features/expressions/expressionCatalog'

const QUICK_EMOJIS = [...new Set([...DEFAULT_EMOJI_REACTIONS, '🔥'])]
const FORWARDED_MARKER = '[[FORWARDED]]'

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || '')
  }
  return String(value)
}

const getReplyPreview = (replyTo, lookup = {}) => {
  if (!replyTo) return ''

  if (typeof replyTo === 'string') {
    const resolvedById = lookup[normalizeId(replyTo)]
    if (resolvedById) return String(resolvedById).slice(0, 50)

    const looksLikeId = /^[a-f0-9-]{24,}$/i.test(replyTo)
    if (looksLikeId) return 'Tin nhắn gốc'

    return replyTo.slice(0, 50)
  }

  const raw = replyTo.content || replyTo.text || replyTo.message
  if (raw) return String(raw).slice(0, 50)

  const replyId = normalizeId(replyTo._id || replyTo.messageId || replyTo.id)
  if (replyId && lookup[replyId]) {
    return String(lookup[replyId]).slice(0, 50)
  }

  return 'Tin nhắn gốc'
}

const getPrimaryAttachment = (message) => {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  return attachments[0] || null
}

const parseForwardedContent = (content = '') => {
  if (typeof content !== 'string') {
    return { isForwarded: false, cleanText: '' }
  }

  if (!content.startsWith(FORWARDED_MARKER)) {
    return { isForwarded: false, cleanText: content }
  }

  return {
    isForwarded: true,
    cleanText: content.replace(FORWARDED_MARKER, '').trim(),
  }
}

const resolveAttachmentType = (message, attachment) => {
  const rawType = message?.type || attachment?.type || ''
  if (rawType === 'image' || rawType === 'video' || rawType === 'file') {
    return rawType
  }

  const mimeType = String(attachment?.mimeType || '')
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

const formatMessageTime = (value) => {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const formatCallDuration = (totalSeconds = 0) => {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const Message = ({
  message,
  currentUserId,
  isGroup,
  senderInfo,
  onReply,
  onEdit,
  onDelete,
  onDeleteForAll,
  onReact,
  onShare,
  onJoinCall,
  replyPreviewMap,
}) => {
  // Handle message safety
  if (!message) return null

  // Normalize message field names
  const senderId = normalizeId(
    message?.senderId ||
    message?.userId ||
    message?.sender ||
    message?.sender?._id ||
    message?.sender?.userId ||
    message?.sender?.id
  )
  const messageId = message._id || message.messageId

  const normalizedCurrentUserId = normalizeId(currentUserId)
  const messageType = String(message?.type || '').toLowerCase()
  const messageMetadata = message?.metadata || {}
  const isCallMessage = messageMetadata?.kind === 'call'
  const isGroupCallActiveNotice = messageMetadata?.kind === 'group_call_active'
  const senderSystemName = String(
    message?.senderName ||
    message?.sender?.name ||
    message?.sender?.username ||
    ''
  ).trim().toLowerCase()
  const isSystemSender =
    senderId === 'system' ||
    senderId === 'tixchat-system' ||
    senderSystemName === 'system' ||
    senderSystemName === 'tixchat system'
  const isSystemMessage = messageType === 'system' || message?.isSystem === true || isSystemSender
  const isEmojiMessage = messageType === 'emoji'
  const deletedBy = message?.deletedBy || {}
  const isGloballyDeleted = message?.isDeleted === true
  const isDeletedByMe = !!deletedBy[normalizedCurrentUserId]
  const isHidden = isGloballyDeleted || isDeletedByMe
  const isOwnMessage = !isSystemMessage && senderId !== '' && senderId === normalizedCurrentUserId
  const isSeen = message.seenBy && message.seenBy.length > 0
  const reactions = message.reactions || {}
  const reactionEntries = Object.entries(reactions).filter(([, userIds]) => Array.isArray(userIds) && userIds.length > 0)
  const replyPreview = getReplyPreview(message.replyTo, replyPreviewMap)
  const rawMessageText = typeof message.content === 'string' ? message.content : ''
  const { isForwarded, cleanText: messageText } = parseForwardedContent(rawMessageText)
  const primaryAttachment = getPrimaryAttachment(message)
  const attachmentType = resolveAttachmentType(message, primaryAttachment)
  const senderDisplayName =
    senderInfo?.nickname ||
    senderInfo?.displayName ||
    senderInfo?.fullName ||
    senderInfo?.name ||
    senderInfo?.username ||
    'Người dùng'
  const senderAvatar = senderInfo?.avatar || ''
  const senderInitial = String(senderDisplayName || '?').trim().charAt(0).toUpperCase() || '?'

  if (isSystemMessage) {
    const canJoinGroupCall = Boolean(
      isGroupCallActiveNotice &&
      messageMetadata?.active !== false &&
      normalizeId(messageMetadata?.callId)
    )

    return (
      <div className="message system" role="status" aria-live="polite">
        <div className="message-wrapper">
          <div className="message-content">
            <p className="message-text">{message?.content || ''}</p>
            {canJoinGroupCall && (
              <button
                type="button"
                className="system-call-join-button"
                onClick={() => onJoinCall?.(messageMetadata.callId)}
              >
                Tham gia cuộc gọi
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (isHidden) {
    return (
      <div className={`message ${isOwnMessage ? 'own' : 'other'} deleted-message`}>
        <div className="message-wrapper">
          {isGroup && !isOwnMessage && (
            <div className={`message-sender-row ${isOwnMessage ? 'own' : 'other'}`}>
              {senderAvatar ? (
                <img src={senderAvatar} alt={senderDisplayName} className="message-sender-avatar" />
              ) : (
                <span className="message-sender-avatar placeholder" aria-hidden="true">{senderInitial}</span>
              )}
              <span className="message-sender-name">{senderDisplayName}</span>
            </div>
          )}
          <div className={`message-row ${isOwnMessage ? 'own' : 'other'}`}>
            <div className="message-content">
              <p className="message-text deleted-placeholder">
                {isGloballyDeleted ? 'Tin nhắn đã được gỡ' : 'Tin nhắn đã được xóa'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false)
  const deleteDropdownRef = useRef(null)

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (deleteDropdownRef.current && !deleteDropdownRef.current.contains(e.target)) {
        setDeleteMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasReacted = (userIds = []) =>
    userIds.some((id) => normalizeId(id) === normalizedCurrentUserId)

  if (isCallMessage) {
    const callType = String(messageMetadata?.callType || '').toLowerCase() === 'video' ? 'video' : 'thoại'
    const callDisplayStatus = String(messageMetadata?.displayStatus || '').toLowerCase() === 'missed'
      ? 'missed'
      : 'completed'
    const isMissedCall = callDisplayStatus === 'missed'
    const callDuration = Number(messageMetadata?.durationSeconds || 0)
    const callTitle = isMissedCall ? `Cuộc gọi ${callType} nhỡ` : `Cuộc gọi ${callType}`
    const callSubtitle = isMissedCall
      ? 'Không có ai bắt máy'
      : `Thời gian gọi: ${formatCallDuration(callDuration)}`

    return (
      <div className={`message ${isOwnMessage ? 'own' : 'other'} call-message ${isMissedCall ? 'missed' : 'completed'}`}>
        <div className="message-wrapper">
          <div className="message-content call-message-content">
            <div className={`call-message-icon ${isMissedCall ? 'missed' : 'completed'}`}>
              {callType === 'video' ? <FiVideo /> : <FiPhone />}
            </div>
            <div className="call-message-copy">
              <p className="call-message-title">{callTitle}</p>
              <p className="call-message-subtitle">{callSubtitle}</p>
            </div>
            <div className="message-footer call-message-footer">
              <span className="message-time">{formatMessageTime(message.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`message ${isOwnMessage ? 'own' : 'other'} ${isEmojiMessage ? 'emoji-message' : ''}`}>
      <div className="message-wrapper">
        {isGroup && !isOwnMessage && (
          <div className={`message-sender-row ${isOwnMessage ? 'own' : 'other'}`}>
            {senderAvatar ? (
              <img src={senderAvatar} alt={senderDisplayName} className="message-sender-avatar" />
            ) : (
              <span className="message-sender-avatar placeholder" aria-hidden="true">{senderInitial}</span>
            )}
            <span className="message-sender-name">{senderDisplayName}</span>
          </div>
        )}

        <div className={`message-row ${isOwnMessage ? 'own' : 'other'}`}>
          <div className={`message-content ${isEmojiMessage ? 'emoji-message-content' : ''}`}>
        {replyPreview && (
          <div className="message-reply">
            <small>Trả lời: {replyPreview}...</small>
          </div>
        )}

        {primaryAttachment && attachmentType === 'image' && (
          <a href={primaryAttachment.url} target="_blank" rel="noreferrer" className="message-attachment-link">
            <img
              src={primaryAttachment.url}
              alt={primaryAttachment.name || 'image attachment'}
              className="message-attachment-image"
              loading="lazy"
            />
          </a>
        )}

        {primaryAttachment && attachmentType === 'video' && (
          <video className="message-attachment-video" controls preload="metadata">
            <source src={primaryAttachment.url} type={primaryAttachment.mimeType || 'video/mp4'} />
            Trình duyệt của bạn không hỗ trợ video.
          </video>
        )}

        {primaryAttachment && attachmentType === 'file' && (
          <a
            href={primaryAttachment.url}
            target="_blank"
            rel="noreferrer"
            className="message-attachment-file"
          >
            <strong>{primaryAttachment.name || 'Tệp đính kèm'}</strong>
            <span>Tải xuống</span>
          </a>
        )}

  {isForwarded && <small className="message-forwarded-label">Đã chuyển tiếp</small>}

  {messageText && <p className={`message-text ${isEmojiMessage ? 'emoji-message-text' : ''}`}>{messageText}</p>}

        {reactionEntries.length > 0 && (
          <div className="message-reactions">
            {reactionEntries.map(([emoji, userIds]) => (
              <button
                key={emoji}
                type="button"
                className={`reaction-badge ${hasReacted(userIds) ? 'active' : ''}`}
                onClick={() => onReact?.(message, emoji)}
                title={`${userIds.length} người đã thả`}
              >
                <span>{emoji}</span>
                <span>{userIds.length}</span>
              </button>
            ))}
          </div>
        )}

        {message.isEdited && <small className="message-edited">(chỉnh sửa)</small>}

        <div className="message-footer">
          <span className="message-time">
            {formatMessageTime(message.createdAt)}
          </span>

          {isOwnMessage && (
            <span className="message-status">
                {message.status === 'seen' && isSeen && <MdDoneAll />}
                {message.status === 'delivered' && <MdDoneAll />}
                {message.status === 'sent' && <MdDone />}
            </span>
          )}
        </div>
      </div>

      <div className="message-actions">
          <button onClick={() => onReply?.(message)} title="Trả lời" aria-label="reply">
            <FiCornerUpLeft />
          </button>

          <button onClick={() => onShare?.(message)} title="Chia sẻ" aria-label="share">
            <FiShare2 />
          </button>

        {isOwnMessage ? (
          <>
              <button onClick={() => onEdit?.(message)} title="Chỉnh sửa" aria-label="edit">
                <FiEdit2 />
              </button>
              <div className="delete-dropdown-wrap" ref={deleteDropdownRef}>
                <button
                  className="delete-menu-btn"
                  title="Xóa"
                  aria-label="delete options"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteMenuOpen((prev) => !prev)
                  }}
                >
                  <FiTrash2 />
                </button>
                {deleteMenuOpen && (
                  <div className="delete-dropdown" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="delete-dropdown-item"
                      onClick={() => {
                        setDeleteMenuOpen(false)
                        onDelete?.(messageId)
                      }}
                    >
                      <FiTrash2 />
                      <span>Xóa</span>
                    </button>
                    <button
                      className="delete-dropdown-item danger"
                      onClick={() => {
                        setDeleteMenuOpen(false)
                        onDeleteForAll?.(messageId)
                      }}
                    >
                      <FiTrash2 />
                      <span>Gỡ</span>
                    </button>
                  </div>
                )}
              </div>
          </>
        ) : (
          <>
            <div className="delete-dropdown-wrap" ref={deleteDropdownRef}>
              <button
                className="delete-menu-btn"
                title="Xóa"
                aria-label="delete options"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteMenuOpen((prev) => !prev)
                }}
              >
                <FiTrash2 />
              </button>
              {deleteMenuOpen && (
                <div className="delete-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="delete-dropdown-item"
                    onClick={() => {
                      setDeleteMenuOpen(false)
                      onDelete?.(messageId)
                    }}
                  >
                    <FiTrash2 />
                    <span>Xóa</span>
                  </button>
                </div>
              )}
            </div>
            <div className="reaction-picker" title="Thả cảm xúc">
            {QUICK_EMOJIS.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                className="reaction-option"
                onClick={() => onReact?.(message, emoji)}
                title={`Thả ${emoji}`}
              >
                {emoji}
              </button>
            ))}
              <button
                type="button"
                className="reaction-open"
                onClick={() => onReact?.(message, 'toggle-picker')}
                title="Mở bộ cảm xúc"
                aria-label="open reactions"
              >
                <FaRegSmile />
              </button>
          </div>
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}

const areEqual = (prevProps, nextProps) => {
  const prevMessage = prevProps.message || {}
  const nextMessage = nextProps.message || {}

  const prevId = normalizeId(prevMessage._id || prevMessage.messageId)
  const nextId = normalizeId(nextMessage._id || nextMessage.messageId)
  if (prevId !== nextId) return false

  return (
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.isGroup === nextProps.isGroup &&
    prevProps.senderInfo === nextProps.senderInfo &&
    prevMessage.content === nextMessage.content &&
    prevMessage.metadata === nextMessage.metadata &&
    prevMessage.type === nextMessage.type &&
    prevMessage.status === nextMessage.status &&
    prevMessage.isEdited === nextMessage.isEdited &&
    prevMessage.editedAt === nextMessage.editedAt &&
    prevMessage.isDeleted === nextMessage.isDeleted &&
    JSON.stringify(prevMessage.deletedBy) === JSON.stringify(nextMessage.deletedBy) &&
    prevMessage.replyTo === nextMessage.replyTo &&
    prevMessage.reactions === nextMessage.reactions &&
    prevMessage.seenBy === nextMessage.seenBy &&
    prevMessage.attachments === nextMessage.attachments
  )
}

export default React.memo(Message, areEqual)
