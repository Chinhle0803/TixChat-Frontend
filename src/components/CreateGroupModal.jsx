import React, { useEffect, useMemo, useState } from 'react'
import { FiUsers, FiX } from 'react-icons/fi'
import { userService } from '../services/api'
import { useDialog } from '../context/DialogContext'
import '../styles/CreateGroupModal.css'

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

const CreateGroupModal = ({
  isOpen,
  onClose,
  onCreateGroup,
  currentUserId,
}) => {
  const { notify } = useDialog()
  const [groupName, setGroupName] = useState('')
  const [search, setSearch] = useState('')
  const [friendUsers, setFriendUsers] = useState([])
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    let isCancelled = false

    const loadFriends = async () => {
      setLoadingFriends(true)
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

        const nextFriendUsers = profileResults
          .filter((item) => item.status === 'fulfilled' && item.value)
          .map((item) => item.value)

        setFriendUsers(nextFriendUsers)
      } catch (error) {
        console.error('Load friends for create group failed:', error)
      } finally {
        if (!isCancelled) {
          setLoadingFriends(false)
        }
      }
    }

    setGroupName('')
    setSearch('')
    setSelectedUserIds([])
    setFriendUsers([])
    loadFriends()

    return () => {
      isCancelled = true
    }
  }, [isOpen, currentUserId])

  const filteredFriendUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return friendUsers

    return friendUsers.filter((friendUser) => {
      const displayName = getDisplayName(friendUser).toLowerCase()
      const username = String(friendUser?.username || '').toLowerCase()
      return displayName.includes(keyword) || username.includes(keyword)
    })
  }, [friendUsers, search])

  const toggleFriendSelection = (userId) => {
    setSelectedUserIds((prev) => (
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    ))
  }

  const handleCreateGroup = async () => {
    if (selectedUserIds.length < 2) {
      await notify({
        title: 'Thiếu thành viên',
        message: 'Vui lòng chọn ít nhất 2 bạn bè để tạo nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    try {
      setCreatingGroup(true)
      await onCreateGroup?.(selectedUserIds, groupName)
      onClose?.()
      await notify({
        title: 'Tạo nhóm thành công',
        message: 'Nhóm mới đã được tạo và mở trong màn hình chat.',
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Không thể tạo nhóm',
        message: error?.response?.data?.error || error?.message || 'Tạo nhóm thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    } finally {
      setCreatingGroup(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="create-group-overlay" onClick={onClose}>
      <div className="create-group-modal" onClick={(event) => event.stopPropagation()}>
        <div className="create-group-header">
          <h3>
            <FiUsers />
            Tạo nhóm mới
          </h3>
          <button type="button" onClick={onClose} aria-label="Đóng tạo nhóm">
            <FiX />
          </button>
        </div>

        <div className="create-group-body">
          <label className="create-group-field">
            <span>Tên nhóm</span>
            <input
              type="text"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Nhập tên nhóm (không bắt buộc)"
            />
          </label>

          <label className="create-group-field">
            <span>Tìm bạn bè</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên hoặc username"
            />
          </label>

          <div className="create-group-selection-meta">
            Đã chọn: <strong>{selectedUserIds.length}</strong> thành viên
          </div>

          <div className="create-group-list">
            {loadingFriends ? (
              <p className="create-group-empty">Đang tải danh sách bạn bè...</p>
            ) : filteredFriendUsers.length === 0 ? (
              <p className="create-group-empty">Không có bạn bè phù hợp để chọn.</p>
            ) : (
              filteredFriendUsers.map((friendUser) => {
                const userId = normalizeId(friendUser?.userId || friendUser?._id)
                const isSelected = selectedUserIds.includes(userId)

                return (
                  <label key={userId} className={`create-group-item ${isSelected ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFriendSelection(userId)}
                    />
                    <div>
                      <strong>{getDisplayName(friendUser)}</strong>
                      <small>@{friendUser?.username || 'unknown'}</small>
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>

        <div className="create-group-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="primary"
            disabled={creatingGroup || selectedUserIds.length < 2}
            onClick={handleCreateGroup}
          >
            {creatingGroup ? 'Đang tạo...' : 'Tạo nhóm'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateGroupModal
