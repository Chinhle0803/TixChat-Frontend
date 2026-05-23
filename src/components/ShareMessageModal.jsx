import React, { useEffect, useMemo, useState } from 'react'
import { FiSend, FiShare2, FiUser, FiX } from 'react-icons/fi'
import { userService } from '../services/api'
import { useDialog } from '../context/DialogContext'
import '../styles/ShareMessageModal.css'

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

const buildMessagePreview = (message) => {
  if (!message) return ''

  const text = String(message?.content || '').trim()
  const attachment = Array.isArray(message?.attachments) ? message.attachments[0] : null
  const attachmentName = attachment?.name || ''

  if (text && attachmentName) {
    return `${text} • Tệp: ${attachmentName}`
  }

  if (text) return text
  if (attachmentName) return `Tệp đính kèm: ${attachmentName}`

  return 'Tin nhắn chia sẻ'
}

const ShareMessageModal = ({ isOpen, onClose, onShare, message, currentUserId }) => {
  const { notify } = useDialog()
  const [friendUsers, setFriendUsers] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!isOpen) return

    let isCancelled = false

    const loadFriends = async () => {
      setLoading(true)
      try {
        const response = await userService.getFriends()
        if (isCancelled) return

        const friendIds = (response?.data?.friends || [])
          .map((id) => normalizeId(id))
          .filter((id) => id && id !== normalizeId(currentUserId))

        const profileResults = await Promise.allSettled(
          friendIds.map(async (friendId) => {
            const profileResponse = await userService.getProfile(friendId)
            return profileResponse?.data?.user || null
          })
        )

        if (isCancelled) return

        const users = profileResults
          .filter((item) => item.status === 'fulfilled' && item.value)
          .map((item) => item.value)

        setFriendUsers(users)
      } catch (error) {
        console.error('Load friends for share failed:', error)
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    setSelectedIds([])
    setSearch('')
    loadFriends()

    return () => {
      isCancelled = true
    }
  }, [isOpen, currentUserId])

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return friendUsers

    return friendUsers.filter((user) => {
      const displayName = getDisplayName(user).toLowerCase()
      const username = String(user?.username || '').toLowerCase()
      return displayName.includes(keyword) || username.includes(keyword)
    })
  }, [friendUsers, search])

  const toggleUser = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  const handleShare = async () => {
    if (selectedIds.length === 0) {
      await notify({
        title: 'Thiếu người nhận',
        message: 'Vui lòng chọn ít nhất 1 bạn để chia sẻ.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    try {
      setSharing(true)
      await onShare?.(selectedIds)
      onClose?.()
    } catch (error) {
      await notify({
        title: 'Chia sẻ thất bại',
        message: error?.response?.data?.error || error?.message || 'Chia sẻ tin nhắn thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    } finally {
      setSharing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="share-message-overlay" onClick={onClose}>
      <div className="share-message-modal" onClick={(event) => event.stopPropagation()}>
        <div className="share-message-header">
          <h3>
            <FiShare2 />
            Chia sẻ tin nhắn
          </h3>
          <button type="button" onClick={onClose} aria-label="Đóng chia sẻ">
            <FiX />
          </button>
        </div>

        <div className="share-message-preview">
          <p>{buildMessagePreview(message)}</p>
        </div>

        <input
          type="text"
          className="share-message-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm bạn bè..."
        />

        <div className="share-message-list">
          {loading ? (
            <p className="share-message-empty">Đang tải danh sách bạn bè...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="share-message-empty">Không tìm thấy bạn bè phù hợp.</p>
          ) : (
            filteredUsers.map((user) => {
              const userId = normalizeId(user?.userId || user?._id)
              const checked = selectedIds.includes(userId)

              return (
                <label key={userId} className={`share-message-item ${checked ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUser(userId)}
                  />

                  <div className="share-message-user-info">
                    <span className="avatar">
                      {user?.avatar ? <img src={user.avatar} alt={getDisplayName(user)} /> : <FiUser />}
                    </span>

                    <div>
                      <strong>{getDisplayName(user)}</strong>
                      <small>@{user?.username || 'unknown'}</small>
                    </div>
                  </div>
                </label>
              )
            })
          )}
        </div>

        <div className="share-message-footer">
          <button type="button" className="secondary" onClick={onClose}>Hủy</button>
          <button type="button" className="primary" onClick={handleShare} disabled={sharing || selectedIds.length === 0}>
            <FiSend />
            {sharing ? 'Đang gửi...' : `Chia sẻ (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ShareMessageModal
