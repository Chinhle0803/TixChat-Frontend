import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FiAlertTriangle,
  FiBookOpen,
  FiCheckCircle,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiCopy,
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiFileText,
  FiHash,
  FiLink,
  FiSearch,
  FiShield,
  FiUnlock,
  FiUserPlus,
  FiTrash2,
  FiUsers,
  FiX,
} from 'react-icons/fi'
import { IoNotificationsOffOutline, IoNotificationsOutline } from 'react-icons/io5'
import { RiGroupLine, RiPushpin2Fill, RiPushpin2Line } from 'react-icons/ri'
import { conversationService, userService } from '../services/api'
import { useDialog } from '../context/DialogContext'
import '../styles/ConversationInfoPanelClean.css'

const AUTO_DELETE_OPTIONS = [
  { value: 'never', label: 'Không bao giờ' },
  { value: '1d', label: 'Sau 24 giờ' },
  { value: '7d', label: 'Sau 7 ngày' },
  { value: '30d', label: 'Sau 30 ngày' },
]

const MUTE_DURATION_OPTIONS = [
  { value: '1h', label: '1 giờ', durationMs: 1 * 60 * 60 * 1000 },
  { value: '8h', label: '8 giờ', durationMs: 8 * 60 * 60 * 1000 },
  { value: '24h', label: '24 giờ', durationMs: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '7 ngày', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { value: 'forever', label: 'Vô thời hạn', durationMs: null },
]

const CHAT_BACKGROUND_OPTIONS = [
  { value: 'default', label: 'Mặc định', preview: ['#ffffff', '#2563eb', '#f4f4f5'] },
  { value: 'snow', label: 'Trắng sáng', preview: ['#f8fafc', '#111827', '#e5e7eb'] },
  { value: 'mint', label: 'Mint', preview: ['#ecfeff', '#0f766e', '#cffafe'] },
  { value: 'sunset', label: 'Sunset', preview: ['#fff7ed', '#9a3412', '#fed7aa'] },
  { value: 'lavender', label: 'Lavender', preview: ['#f5f3ff', '#5b21b6', '#ddd6fe'] },
  { value: 'dark', label: 'Tối', preview: ['#0f172a', '#38bdf8', '#1e293b'] },
]

const GROUP_SETTINGS_TABS = [
  { key: 'members', label: 'Thành viên' },
  { key: 'admin', label: 'Quản trị' },
  { key: 'utilities', label: 'Tiện ích' },
  { key: 'storage', label: 'Kho lưu trữ' },
  { key: 'security', label: 'Bảo mật' },
]

const GROUP_NOTIFICATION_FILTER_OPTIONS = [
  { value: 'all', label: 'Nhận tất cả' },
  { value: 'mention', label: 'Chỉ khi được @nhắc tên' },
]

const NEW_MEMBER_HISTORY_OPTIONS = [
  { value: 'all', label: 'Thấy toàn bộ lịch sử' },
  { value: 'from_join', label: 'Chỉ từ lúc tham gia' },
]

const STORAGE_TABS = [
  { key: 'media', label: 'Ảnh/Video' },
  { key: 'file', label: 'File' },
  { key: 'link', label: 'Link' },
]

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || '')
  }
  return String(value)
}

const formatFileSize = (size = 0) => {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const safeDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDate = (value) => {
  const date = safeDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('vi-VN')
}

const extractLinksFromText = (text) => {
  if (!text || typeof text !== 'string') return []
  const matches = text.match(/https?:\/\/[^\s]+/g)
  return matches || []
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

const ConversationInfoPanel = ({
  isOpen,
  onClose,
  conversation,
  currentUserId,
  allConversations,
  messages,
  counterpart,
  preference,
  onUpdatePreference,
  onOpenNewConversation,
  onCreateGroupConversation,
  onDeleteConversation,
  onRefreshConversationData,
}) => {
  const { notify, confirm, prompt } = useDialog()
  const [expandedSections, setExpandedSections] = useState({
    media: true,
    file: true,
    link: true,
    privacy: true,
  })
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [showAllFiles, setShowAllFiles] = useState(false)
  const [showAllLinks, setShowAllLinks] = useState(false)
  const [showGroupBuilder, setShowGroupBuilder] = useState(false)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [addMemberSearchText, setAddMemberSearchText] = useState('')
  const [groupCandidates, setGroupCandidates] = useState([])
  const [selectedMemberIds, setSelectedMemberIds] = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [showMuteDurationPicker, setShowMuteDurationPicker] = useState(false)
  const [showMessageSearchModal, setShowMessageSearchModal] = useState(false)
  const [messageSearchText, setMessageSearchText] = useState('')
  const [showGroupManagementView, setShowGroupManagementView] = useState(false)
  const [showGroupMembersView, setShowGroupMembersView] = useState(false)
  const [activeGroupTab, setActiveGroupTab] = useState('members')
  const [groupProfileMap, setGroupProfileMap] = useState({})
  const [isLoadingGroupProfiles, setIsLoadingGroupProfiles] = useState(false)
  const [memberSearchText, setMemberSearchText] = useState('')
  const [storageSearchText, setStorageSearchText] = useState('')
  const [activeStorageTab, setActiveStorageTab] = useState('media')
  const [participantRecords, setParticipantRecords] = useState([])
  const [blockedUserIds, setBlockedUserIds] = useState([])
  const [loadingGroupAdminData, setLoadingGroupAdminData] = useState(false)
  const [isUpdatingGroupAvatar, setIsUpdatingGroupAvatar] = useState(false)
  const groupAvatarInputRef = useRef(null)

  const conversationId = normalizeId(conversation?._id || conversation?.conversationId)
  const isGroupConversation = conversation?.type === 'group'
  const normalizedCurrentUserId = normalizeId(currentUserId)
  const normalizedCreatorId = normalizeId(conversation?.creatorId || conversation?.admin)
  const muteUntilTs = Number(preference?.muteUntil || 0)
  const isMuteExpired = Boolean(preference?.muted && muteUntilTs && muteUntilTs <= Date.now())
  const isMutedActive = Boolean(preference?.muted) && !isMuteExpired
  const muteDurationLabel = MUTE_DURATION_OPTIONS.find((item) => item.value === preference?.muteDuration)?.label
  const participantRoleMap = useMemo(() => {
    const map = new Map()
    ;(participantRecords || []).forEach((item) => {
      const userId = normalizeId(item?.userId)
      if (!userId) return
      map.set(userId, String(item?.role || 'member'))
    })
    return map
  }, [participantRecords])

  const currentUserRole = participantRoleMap.get(normalizedCurrentUserId) ||
    (normalizedCurrentUserId && normalizedCurrentUserId === normalizedCreatorId ? 'admin' : 'member')

  const isCurrentUserAdmin = currentUserRole === 'admin'
  const isCurrentUserModerator = currentUserRole === 'moderator'
  const isCurrentUserOwner = Boolean(normalizedCurrentUserId) && normalizedCurrentUserId === normalizedCreatorId
  const canOperateAdminControls = isCurrentUserAdmin || isCurrentUserModerator || isCurrentUserOwner
  const canManageGroup = isGroupConversation && canOperateAdminControls
  const canDissolveGroup = isCurrentUserOwner
  const groupSettings = conversation?.groupSettings || {}
  const visibleGroupTabs = useMemo(
    () => (canManageGroup
      ? GROUP_SETTINGS_TABS
      : GROUP_SETTINGS_TABS.filter((tab) => tab.key !== 'admin')),
    [canManageGroup]
  )

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  useEffect(() => {
    const shouldLoadCandidates = showGroupBuilder || showAddMemberModal
    if (!isOpen || !shouldLoadCandidates) return

    let isCancelled = false

    const loadCandidates = async () => {
      setLoadingCandidates(true)
      try {
        const counterpartId = normalizeId(counterpart?.id)
        const existingParticipantIds = new Set(
          (conversation?.participants || []).map((participant) => normalizeId(participant)).filter(Boolean)
        )
        const response = await userService.getFriends()
        if (isCancelled) return

        const friendIds = response?.data?.friends || []
        const filteredFriendIds = friendIds
          .map((id) => normalizeId(id))
          .filter((id) => {
            if (!id) return false
            if (counterpartId && id === counterpartId) return false
            if (isGroupConversation && existingParticipantIds.has(id)) return false
            return true
          })

        const profiles = await Promise.allSettled(
          filteredFriendIds.map(async (userId) => {
            const profileResponse = await userService.getProfile(userId)
            return profileResponse?.data?.user || null
          })
        )

        if (isCancelled) return

        const users = profiles
          .filter((item) => item.status === 'fulfilled' && item.value)
          .map((item) => item.value)

        const uniqueUsersById = new Map()
        users.forEach((user) => {
          const normalizedUserId = normalizeId(user?.userId || user?._id || user?.id)
          if (!normalizedUserId) return

          if (!uniqueUsersById.has(normalizedUserId)) {
            uniqueUsersById.set(normalizedUserId, {
              ...user,
              userId: normalizedUserId,
            })
          }
        })

        setGroupCandidates(Array.from(uniqueUsersById.values()))
      } catch (error) {
        console.error('Load group candidates failed:', error)
      } finally {
        if (!isCancelled) {
          setLoadingCandidates(false)
        }
      }
    }

    loadCandidates()

    return () => {
      isCancelled = true
    }
  }, [
    isOpen,
    showGroupBuilder,
    showAddMemberModal,
    counterpart,
    isGroupConversation,
    conversation?.participants,
  ])

  useEffect(() => {
    if (activeGroupTab === 'admin' && !canManageGroup) {
      setActiveGroupTab('members')
    }
  }, [activeGroupTab, canManageGroup])

  useEffect(() => {
    if (!isOpen) {
      setShowGroupManagementView(false)
      setShowGroupMembersView(false)
      return
    }

    if (!isGroupConversation) {
      setShowGroupManagementView(false)
      setShowGroupMembersView(false)
    }
  }, [isOpen, isGroupConversation, conversationId])

  useEffect(() => {
    if (!isOpen) return
    if (!preference?.muted) return
    if (!muteUntilTs) return
    if (muteUntilTs > Date.now()) return

    onUpdatePreference?.({
      muted: false,
      muteUntil: null,
      muteDuration: null,
    })
  }, [isOpen, muteUntilTs, onUpdatePreference, preference?.muted])

  useEffect(() => {
    if (!isOpen || !isGroupConversation) return

    const participantIds = (conversation?.participants || [])
      .map((participant) => normalizeId(participant))
      .filter(Boolean)

    if (participantIds.length === 0) {
      setGroupProfileMap({})
      return
    }

    let isCancelled = false

    const loadGroupProfiles = async () => {
      setIsLoadingGroupProfiles(true)
      try {
        const loadedProfiles = await Promise.allSettled(
          participantIds.map(async (userId) => {
            const profileResponse = await userService.getProfile(userId)
            return [userId, profileResponse?.data?.user || null]
          })
        )

        if (isCancelled) return

        const nextMap = {}
        loadedProfiles.forEach((item) => {
          if (item.status !== 'fulfilled') return
          const [userId, profile] = item.value || []
          if (!userId) return
          nextMap[userId] = profile || { userId }
        })

        setGroupProfileMap(nextMap)
      } catch (error) {
        console.error('Load group participant profiles failed:', error)
      } finally {
        if (!isCancelled) {
          setIsLoadingGroupProfiles(false)
        }
      }
    }

    loadGroupProfiles()

    return () => {
      isCancelled = true
    }
  }, [isOpen, isGroupConversation, conversation?.participants])

  useEffect(() => {
    if (!isOpen || !isGroupConversation || !conversationId) return

    let isCancelled = false

    const loadGroupAdminData = async () => {
      setLoadingGroupAdminData(true)

      try {
        const [participantsResponse, blockedResponse] = await Promise.all([
          conversationService.getParticipants(conversationId),
          conversationService.getBlockedUsers(conversationId),
        ])

        if (isCancelled) return

        setParticipantRecords(participantsResponse?.data?.participants || [])
        setBlockedUserIds(blockedResponse?.data?.blockedUserIds || [])
      } catch (error) {
        if (!isCancelled) {
          console.warn('Load group admin data failed:', error?.message || error)
        }
      } finally {
        if (!isCancelled) {
          setLoadingGroupAdminData(false)
        }
      }
    }

    loadGroupAdminData()

    return () => {
      isCancelled = true
    }
  }, [isOpen, isGroupConversation, conversationId])

  const refreshGroupData = async () => {
    if (!isGroupConversation || !conversationId) return

    try {
      const [participantsResponse, blockedResponse] = await Promise.all([
        conversationService.getParticipants(conversationId),
        conversationService.getBlockedUsers(conversationId),
      ])

      setParticipantRecords(participantsResponse?.data?.participants || [])
      setBlockedUserIds(blockedResponse?.data?.blockedUserIds || [])
    } catch (error) {
      console.warn('Refresh group data failed:', error?.message || error)
    }
  }

  const mediaItems = useMemo(() => {
    const all = []

    ;(messages || []).forEach((message) => {
      const attachments = Array.isArray(message?.attachments) ? message.attachments : []
      attachments.forEach((attachment) => {
        const type = resolveAttachmentType(message, attachment)
        if (type !== 'image' && type !== 'video') return
        if (!attachment?.url) return

        all.push({
          id: `${normalizeId(message?._id || message?.messageId)}-${attachment?.url}`,
          type,
          url: attachment.url,
          name: attachment.name || (type === 'image' ? 'Ảnh' : 'Video'),
          createdAt: message?.createdAt,
        })
      })
    })

    return all
  }, [messages])

  const fileItems = useMemo(() => {
    const all = []

    ;(messages || []).forEach((message) => {
      const attachments = Array.isArray(message?.attachments) ? message.attachments : []
      attachments.forEach((attachment) => {
        const type = resolveAttachmentType(message, attachment)
        if (type !== 'file') return

        all.push({
          id: `${normalizeId(message?._id || message?.messageId)}-${attachment?.url || attachment?.name}`,
          name: attachment?.name || 'Tệp đính kèm',
          url: attachment?.url,
          size: attachment?.size,
          createdAt: message?.createdAt,
          mimeType: attachment?.mimeType,
        })
      })
    })

    return all
  }, [messages])

  const linkItems = useMemo(() => {
    const unique = new Set()
    const links = []

    ;(messages || []).forEach((message) => {
      const urls = extractLinksFromText(message?.content)
      urls.forEach((url) => {
        const normalized = String(url || '').trim()
        if (!normalized || unique.has(normalized)) return
        unique.add(normalized)

        links.push({
          id: `${normalizeId(message?._id || message?.messageId)}-${normalized}`,
          url: normalized,
          createdAt: message?.createdAt,
        })
      })
    })

    return links
  }, [messages])

  const displayedMedia = showAllMedia ? mediaItems : mediaItems.slice(0, 8)
  const displayedFiles = showAllFiles ? fileItems : fileItems.slice(0, 4)
  const displayedLinks = showAllLinks ? linkItems : linkItems.slice(0, 4)

  const sharedGroupCount = useMemo(() => {
    const counterpartId = normalizeId(counterpart?.id)
    const me = normalizeId(currentUserId)

    if (!counterpartId || !me) return 0

    return (allConversations || []).filter((item) => {
      if (item?.type !== 'group') return false
      const participants = item?.participants || []
      const ids = participants.map((participant) => normalizeId(participant))
      return ids.includes(me) && ids.includes(counterpartId)
    }).length
  }, [allConversations, counterpart, currentUserId])

  const groupMemberRecords = useMemo(() => {
    if (!isGroupConversation) return []

    const ids = (conversation?.participants || [])
      .map((participant) => normalizeId(participant))
      .filter(Boolean)

    return ids.map((userId) => {
      const profile = groupProfileMap?.[userId] || {}
      const displayName =
        profile?.nickname ||
        profile?.displayName ||
        profile?.fullName ||
        profile?.username ||
        `user-${userId.slice(0, 6)}`
      const role = participantRoleMap.get(userId) || (userId === normalizedCreatorId ? 'admin' : 'member')

      return {
        userId,
        profile,
        displayName,
        phone: profile?.phoneNumber || profile?.phone || '',
        avatar: profile?.avatar || '',
        role,
      }
    })
  }, [isGroupConversation, conversation?.participants, groupProfileMap, participantRoleMap, normalizedCreatorId])

  const filteredGroupCandidates = useMemo(() => {
    const keywordSource = isGroupConversation ? addMemberSearchText : groupName
    const keyword = String(keywordSource || '').trim().toLowerCase()
    if (!keyword) return groupCandidates

    return groupCandidates.filter((user) => {
      const name = String(
        user?.nickname || user?.displayName || user?.fullName || user?.username || ''
      ).toLowerCase()
      const phone = String(user?.phoneNumber || user?.phone || '').toLowerCase()
      return name.includes(keyword) || phone.includes(keyword)
    })
  }, [groupCandidates, addMemberSearchText, groupName, isGroupConversation])

  const openAddMemberModal = async () => {
    if (!isGroupConversation) {
      await notify({
        title: 'Chỉ dùng cho nhóm',
        message: 'Bạn chỉ có thể thêm thành viên trong cuộc trò chuyện nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'info',
      })
      return
    }

    if (!canOperateAdminControls) {
      await notify({
        title: 'Không có quyền thêm thành viên',
        message: 'Chỉ trưởng nhóm hoặc phó nhóm mới có thể thêm thành viên vào nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    setAddMemberSearchText('')
    setSelectedMemberIds([])
    setShowAddMemberModal(true)
  }

  const filteredGroupMembers = useMemo(() => {
    const keyword = memberSearchText.trim().toLowerCase()
    if (!keyword) return groupMemberRecords

    return groupMemberRecords.filter((member) => {
      const name = String(member.displayName || '').toLowerCase()
      const phone = String(member.phone || '').toLowerCase()
      return name.includes(keyword) || phone.includes(keyword)
    })
  }, [groupMemberRecords, memberSearchText])

  const storageItems = useMemo(() => {
    const senderNameById = new Map(
      groupMemberRecords.map((member) => [member.userId, member.displayName])
    )

    const media = mediaItems.map((item) => {
      const senderId = normalizeId(item?.senderId)
      return {
        ...item,
        senderId,
        senderName: senderNameById.get(senderId) || 'Thành viên',
      }
    })

    const files = fileItems.map((item) => {
      const senderId = normalizeId(item?.senderId)
      return {
        ...item,
        senderId,
        senderName: senderNameById.get(senderId) || 'Thành viên',
      }
    })

    const links = linkItems.map((item) => {
      const senderId = normalizeId(item?.senderId)
      return {
        ...item,
        senderId,
        senderName: senderNameById.get(senderId) || 'Thành viên',
      }
    })

    return { media, file: files, link: links }
  }, [groupMemberRecords, mediaItems, fileItems, linkItems])

  const totalSharedFileSize = useMemo(
    () => (fileItems || []).reduce((acc, item) => acc + Number(item?.size || 0), 0),
    [fileItems]
  )

  const filteredStorageItems = useMemo(() => {
    const activeItems = storageItems?.[activeStorageTab] || []
    const keyword = storageSearchText.trim().toLowerCase()
    if (!keyword) return activeItems

    return activeItems.filter((item) => {
      const name = String(item?.name || item?.url || '').toLowerCase()
      const sender = String(item?.senderName || '').toLowerCase()
      return name.includes(keyword) || sender.includes(keyword)
    })
  }, [storageItems, activeStorageTab, storageSearchText])

  const messageSearchResults = useMemo(() => {
    const keyword = String(messageSearchText || '').trim().toLowerCase()
    if (!keyword) return []

    return (messages || [])
      .map((message) => {
        const senderId = normalizeId(message?.senderId || message?.userId || message?.sender)
        const rawContent = typeof message?.content === 'string' ? message.content : ''
        const content = rawContent.trim()
        const fallbackContent =
          !content && Array.isArray(message?.attachments) && message.attachments.length > 0
            ? '[Tệp đính kèm]'
            : content

        const senderProfile = groupProfileMap?.[senderId] || {}
        const isMe = senderId && senderId === normalizedCurrentUserId

        const senderName = isMe
          ? 'Bạn'
          : (
            message?.senderName ||
            message?.senderDisplayName ||
            senderProfile?.nickname ||
            senderProfile?.displayName ||
            senderProfile?.fullName ||
            senderProfile?.username ||
            (isGroupConversation
              ? (senderId ? `user-${senderId.slice(0, 6)}` : 'Thành viên')
              : (counterpart?.name || 'Người dùng'))
          )

        return {
          id: normalizeId(message?._id || message?.messageId) || `m-${Math.random().toString(36).slice(2, 8)}`,
          senderId,
          senderName,
          content: fallbackContent,
          createdAt: message?.createdAt || message?.updatedAt,
        }
      })
      .filter((item) => String(item.content || '').toLowerCase().includes(keyword))
      .slice(0, 50)
  }, [messages, messageSearchText, groupProfileMap, normalizedCurrentUserId, isGroupConversation, counterpart])

  const headerName = isGroupConversation
    ? String(conversation?.name || 'Nhóm chat')
    : (preference?.alias || '').trim() || counterpart?.name || 'Người dùng'

  const headerAvatar = isGroupConversation ? conversation?.avatar : counterpart?.avatar

  const handleRenameAlias = async () => {
    const currentAlias = preference?.alias || counterpart?.name || ''
    const nextAlias = await prompt({
      title: 'Đặt lại biệt danh',
      message: 'Nhập biệt danh mới cho cuộc trò chuyện này.',
      defaultValue: currentAlias,
      placeholder: 'Biệt danh mới',
      confirmText: 'Lưu',
      cancelText: 'Hủy',
      variant: 'info',
    })

    if (nextAlias === null) return

    onUpdatePreference?.({ alias: nextAlias.trim() })
  }

  const handleToggleMute = () => {
    setShowMuteDurationPicker(true)
  }

  const handleOpenMessageSearch = () => {
    setMessageSearchText('')
    setShowMessageSearchModal(true)
  }

  const handleSelectMuteDuration = (option) => {
    const nextMuteUntil = option.durationMs ? Date.now() + option.durationMs : null

    onUpdatePreference?.({
      muted: true,
      muteDuration: option.value,
      muteUntil: nextMuteUntil,
    })

    setShowMuteDurationPicker(false)
  }

  const handleTurnOnNotifications = () => {
    onUpdatePreference?.({
      muted: false,
      muteDuration: null,
      muteUntil: null,
    })

    setShowMuteDurationPicker(false)
  }

  const handleSelectChatBackground = (background) => {
    onUpdatePreference?.({ chatBackground: background })
  }

  const handleTogglePin = () => {
    onUpdatePreference?.({ pinned: !Boolean(preference?.pinned) })
  }

  const handleToggleHidden = () => {
    onUpdatePreference?.({ hidden: !Boolean(preference?.hidden) })
  }

  const handleChangeAutoDelete = (event) => {
    onUpdatePreference?.({ autoDelete: event.target.value })
  }

  const handleOpenGroupManagement = async () => {
    if (!isGroupConversation) {
      await notify({
        title: 'Quản lý nhóm',
        message: 'Tính năng này chỉ khả dụng trong cuộc trò chuyện nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'info',
      })
      return
    }

    setShowGroupManagementView(true)
  }

  const handleOpenGroupMembers = async () => {
    if (!isGroupConversation) return
    await refreshGroupData()
    setShowGroupMembersView(true)
  }

  const handleOpenCreateGroupFromDirect = () => {
    if (isGroupConversation) return
    setShowGroupBuilder((prev) => !prev)
  }

  const handleCreateGroup = async () => {
    const counterpartId = normalizeId(counterpart?.id)
    if (!counterpartId) {
      await notify({
        title: 'Không thể tạo nhóm',
        message: 'Không thể xác định người dùng để tạo nhóm chung.',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
      return
    }

    if (selectedMemberIds.length === 0) {
      await notify({
        title: 'Thiếu thành viên',
        message: 'Hãy chọn thêm ít nhất 1 thành viên để tạo nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    const participantIds = [counterpartId, ...selectedMemberIds]

    try {
      setCreatingGroup(true)
      await onCreateGroupConversation?.(participantIds, groupName)
      setShowGroupBuilder(false)
      setSelectedMemberIds([])
      setGroupName('')
      await notify({
        title: 'Tạo nhóm thành công',
        message: 'Đã tạo nhóm trò chuyện thành công.',
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Tạo nhóm thất bại',
        message: error?.response?.data?.error || error?.message || 'Tạo nhóm thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleRenameConversationTitle = async () => {
    if (!isGroupConversation || !conversationId) {
      await handleRenameAlias()
      return
    }

    if (!canOperateAdminControls) {
      await notify({
        title: 'Không có quyền đổi tên nhóm',
        message: 'Chỉ trưởng nhóm hoặc phó nhóm mới có thể đổi tên nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    const nextName = await prompt({
      title: 'Đổi tên nhóm',
      message: 'Nhập tên nhóm mới.',
      defaultValue: String(conversation?.name || ''),
      placeholder: 'Tên nhóm mới',
      confirmText: 'Lưu',
      cancelText: 'Hủy',
      variant: 'info',
    })

    if (nextName === null) return

    const trimmedName = String(nextName || '').trim()
    if (!trimmedName) {
      await notify({
        title: 'Tên nhóm không hợp lệ',
        message: 'Tên nhóm không được để trống.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    try {
      await conversationService.updateConversation(conversationId, { name: trimmedName })
      await onRefreshConversationData?.()
      await notify({
        title: 'Đã cập nhật tên nhóm',
        message: `Tên nhóm mới: ${trimmedName}`,
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Không thể đổi tên nhóm',
        message: error?.response?.data?.error || error?.message || 'Cập nhật thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleChangeConversationAvatar = async () => {
    if (!isGroupConversation || !conversationId) {
      return
    }

    if (!canOperateAdminControls) {
      await notify({
        title: 'Không có quyền đổi ảnh nhóm',
        message: 'Chỉ trưởng nhóm hoặc phó nhóm mới có thể đổi ảnh đại diện nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    if (isUpdatingGroupAvatar) {
      return
    }

    groupAvatarInputRef.current?.click()
  }

  const handleGroupAvatarFileChange = async (event) => {
    const file = event?.target?.files?.[0]
    if (!file || !conversationId || !isGroupConversation) {
      if (event?.target) event.target.value = ''
      return
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedMimeTypes.includes(file.type)) {
      await notify({
        title: 'Định dạng ảnh chưa hỗ trợ',
        message: 'Chỉ hỗ trợ ảnh jpg, png, gif hoặc webp.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      event.target.value = ''
      return
    }

    try {
      setIsUpdatingGroupAvatar(true)

      const formData = new FormData()
      formData.append('avatar', file)

      await conversationService.updateConversationAvatar(conversationId, formData)
      await onRefreshConversationData?.()

      await notify({
        title: 'Đã cập nhật ảnh nhóm',
        message: 'Ảnh đại diện nhóm đã được thay đổi từ tệp máy.',
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Không thể đổi ảnh nhóm',
        message: error?.response?.data?.error || error?.message || 'Tải ảnh thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    } finally {
      setIsUpdatingGroupAvatar(false)
      event.target.value = ''
    }
  }

  const handleAddSelectedMembersToGroup = async () => {
    if (!isGroupConversation || !conversationId) return
    if (!canOperateAdminControls) {
      await notify({
        title: 'Không có quyền thêm thành viên',
        message: 'Chỉ trưởng nhóm hoặc phó nhóm mới có thể thêm thành viên vào nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    if (selectedMemberIds.length === 0) {
      await notify({
        title: 'Chưa chọn thành viên',
        message: 'Hãy chọn ít nhất 1 thành viên để thêm vào nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    const candidateNameById = new Map(
      (groupCandidates || []).map((user) => {
        const userId = normalizeId(user?.userId || user?._id || user?.id)
        const displayName = user?.nickname || user?.displayName || user?.fullName || user?.username || userId
        return [userId, displayName]
      })
    )

    const targetIds = Array.from(new Set((selectedMemberIds || []).map((id) => normalizeId(id)).filter(Boolean)))
    if (targetIds.length === 0) {
      await notify({
        title: 'Không có thành viên hợp lệ',
        message: 'Danh sách thêm thành viên không hợp lệ, vui lòng chọn lại.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    let successCount = 0
    const failedMembers = []

    for (const userId of targetIds) {
      try {
        await conversationService.addParticipant(conversationId, userId)
        successCount += 1
      } catch (error) {
        const reason = error?.response?.data?.error || error?.message || 'Lỗi không xác định'
        failedMembers.push({
          userId,
          displayName: candidateNameById.get(userId) || userId,
          reason,
        })
        console.warn('Add group participant failed:', userId, reason)
      }
    }

    if (successCount > 0) {
      setSelectedMemberIds(failedMembers.map((item) => item.userId))
      setAddMemberSearchText('')
      if (failedMembers.length === 0) {
        setShowAddMemberModal(false)
      }

      await refreshGroupData()
      await onRefreshConversationData?.()
    }

    const failurePreview = failedMembers
      .slice(0, 3)
      .map((item) => `• ${item.displayName}: ${item.reason}`)
      .join('\n')
    const hasMoreFailures = failedMembers.length > 3

    await notify({
      title:
        successCount > 0
          ? failedMembers.length > 0
            ? 'Thêm thành viên một phần'
            : 'Đã thêm thành viên'
          : 'Không thể thêm thành viên',
      message:
        successCount > 0
          ? failedMembers.length > 0
            ? `Đã thêm ${successCount} thành viên. ${failedMembers.length} thành viên chưa thêm được:\n${failurePreview}${hasMoreFailures ? '\n• ...' : ''}`
            : `Đã thêm ${successCount} thành viên vào nhóm.`
          : `Không thể thêm thành viên với lựa chọn hiện tại.${failurePreview ? `\n${failurePreview}${hasMoreFailures ? '\n• ...' : ''}` : ''}`,
      confirmText: 'OK',
      variant: successCount > 0 ? (failedMembers.length > 0 ? 'warning' : 'success') : 'warning',
    })
  }

  const handleRemoveGroupMember = async (member) => {
    if (!conversationId || !member?.userId) return
    if (member.userId === normalizedCreatorId) {
      await notify({
        title: 'Không thể xóa trưởng nhóm',
        message: 'Hãy chuyển quyền trưởng nhóm trước khi xóa thành viên này.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    const confirmed = await confirm({
      title: 'Xóa thành viên khỏi nhóm?',
      message: `Bạn có chắc muốn xóa ${member.displayName} khỏi nhóm?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'warning',
    })

    if (!confirmed) return

    try {
      await conversationService.removeParticipant(conversationId, member.userId)
      await refreshGroupData()
      await onRefreshConversationData?.()
      await notify({
        title: 'Đã xóa thành viên',
        message: `${member.displayName} đã được xóa khỏi nhóm.`,
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Không thể xóa thành viên',
        message: error?.response?.data?.error || error?.message || 'Thao tác thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleToggleModerator = async (member) => {
    if (!isCurrentUserAdmin || !member?.userId || member.userId === normalizedCreatorId) return

    const isMod = String(member.role || '') === 'moderator'

    try {
      await conversationService.updateParticipantRole(
        conversationId,
        member.userId,
        isMod ? 'member' : 'moderator'
      )

      await refreshGroupData()
    } catch (error) {
      await notify({
        title: 'Không thể cập nhật vai trò',
        message: error?.response?.data?.error || error?.message || 'Thao tác thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
      return
    }
  }

  const handleCopyInviteLink = async () => {
    if (!conversationId) return

    const inviteCode = String(conversation?.groupInviteCode || conversationId).slice(0, 10).toUpperCase()

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode)
      }
      await notify({
        title: 'Đã sao chép mã mời',
        message: `Mã mời nhóm: ${inviteCode}`,
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Không thể sao chép tự động',
        message: `Mã mời nhóm: ${inviteCode}`,
        confirmText: 'Đã hiểu',
        variant: 'info',
      })
    }
  }

  const handleShowInviteQr = async () => {
    const inviteCode = String(conversation?.groupInviteCode || conversationId || '').slice(0, 10).toUpperCase()
    await notify({
      title: 'Mã mời vào nhóm',
      message: inviteCode
        ? `Chia sẻ mã mời này với thành viên khác: ${inviteCode}`
        : 'Nhóm này chưa có mã mời khả dụng.',
      confirmText: 'OK',
      variant: 'info',
    })
  }

  const handleUpdateGroupSetting = async (patch = {}) => {
    if (!conversationId || !isGroupConversation) return

    try {
      await conversationService.updateGroupSettings(conversationId, patch)
      onUpdatePreference?.(patch)
      await onRefreshConversationData?.()
    } catch (error) {
      await notify({
        title: 'Không thể cập nhật cài đặt nhóm',
        message: error?.response?.data?.error || error?.message || 'Cập nhật thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleBlockGroupMember = async (member) => {
    if (!conversationId || !member?.userId) return

    try {
      await conversationService.blockUserInConversation(conversationId, member.userId)
      await refreshGroupData()
      await onRefreshConversationData?.()
      await notify({
        title: 'Đã chặn thành viên',
        message: `${member.displayName} đã bị chặn khỏi nhóm.`,
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Không thể chặn thành viên',
        message: error?.response?.data?.error || error?.message || 'Thao tác thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleUnblockGroupMember = async (userId) => {
    if (!conversationId || !userId) return

    try {
      await conversationService.unblockUserInConversation(conversationId, userId)
      await refreshGroupData()
      await notify({
        title: 'Đã bỏ chặn',
        message: 'Người dùng đã được bỏ chặn thành công.',
        confirmText: 'OK',
        variant: 'success',
      })
    } catch (error) {
      await notify({
        title: 'Không thể bỏ chặn',
        message: error?.response?.data?.error || error?.message || 'Thao tác thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleLeaveGroup = async () => {
    if (!conversationId) return

    try {
      await conversationService.leaveConversation(conversationId, Boolean(preference?.leaveSilently))
      await notify({
        title: 'Bạn đã rời nhóm',
        message: 'Rời nhóm thành công.',
        confirmText: 'OK',
        variant: 'success',
      })
      onClose?.()
      await onRefreshConversationData?.()
    } catch (error) {
      await notify({
        title: 'Không thể rời nhóm',
        message: error?.response?.data?.error || error?.message || 'Thao tác thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleDissolveGroup = async () => {
    if (!conversationId || !canDissolveGroup) {
      await notify({
        title: 'Không đủ quyền giải tán nhóm',
        message: 'Chỉ chủ nhóm mới có thể giải tán nhóm.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    const confirmed = await confirm({
      title: 'Giải tán nhóm?',
      message: 'Hành động này sẽ xóa toàn bộ nhóm và không thể hoàn tác.',
      confirmText: 'Giải tán',
      cancelText: 'Hủy',
      variant: 'warning',
    })

    if (!confirmed) return

    try {
      await conversationService.dissolveConversation(conversationId)
      await notify({
        title: 'Đã giải tán nhóm',
        message: 'Nhóm đã được giải tán thành công.',
        confirmText: 'OK',
        variant: 'success',
      })
      onClose?.()
      await onRefreshConversationData?.()
    } catch (error) {
      await notify({
        title: 'Không thể giải tán nhóm',
        message: error?.response?.data?.error || error?.message || 'Thao tác thất bại',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleReportConversation = async () => {
    const reason = await prompt({
      title: 'Báo xấu hội thoại',
      message: 'Nhập lý do báo xấu hội thoại này.',
      placeholder: 'Ví dụ: Nội dung spam, quấy rối... ',
      confirmText: 'Gửi báo xấu',
      cancelText: 'Hủy',
      variant: 'warning',
    })

    if (reason === null) return

    if (!reason.trim()) {
      await notify({
        title: 'Thiếu lý do',
        message: 'Lý do báo xấu không được để trống.',
        confirmText: 'Đã hiểu',
        variant: 'warning',
      })
      return
    }

    console.warn('🚩 Report conversation', {
      conversationId,
      reason: reason.trim(),
    })

    await notify({
      title: 'Đã gửi báo xấu',
      message: 'Chúng tôi sẽ xem xét trong thời gian sớm nhất.',
      confirmText: 'OK',
      variant: 'success',
    })
  }

  const handleDeleteHistory = async () => {
    const confirmed = await confirm({
      title: 'Xác nhận xóa lịch sử',
      message: 'Bạn có chắc muốn xóa lịch sử trò chuyện này? Hành động này chỉ áp dụng cho tài khoản của bạn.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      variant: 'warning',
    })
    if (!confirmed) return

    try {
      await onDeleteConversation?.()
      onClose?.()
    } catch (error) {
      await notify({
        title: 'Không thể xóa lịch sử',
        message: error?.response?.data?.error || error?.message || 'Không thể xóa lịch sử trò chuyện',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    }
  }

  const handleOpenReminderList = () => {
    notify({
      title: 'Tính năng sắp ra mắt',
      message: 'Danh sách nhắc hẹn sẽ sớm được cập nhật!',
      confirmText: 'OK',
      variant: 'info',
    })
  }

  const autoDeleteValue = preference?.autoDelete || 'never'
  const autoDeleteLabel =
    AUTO_DELETE_OPTIONS.find((option) => option.value === autoDeleteValue)?.label || 'Không bao giờ'

  if (!isOpen) return null

  return (
    <div className="conversation-info-overlay" onClick={onClose}>
      <aside className="conversation-info-panel" onClick={(event) => event.stopPropagation()}>
        <header className="conversation-info-header">
          <h2>{isGroupConversation ? 'Thông tin nhóm' : 'Thông tin hội thoại'}</h2>
          <button type="button" className="icon-ghost" onClick={onClose} aria-label="Đóng thông tin">
            <FiX />
          </button>
        </header>

        <section className="conversation-profile-section">
          <div
            className="conversation-profile-avatar-wrap"
            onClick={isGroupConversation ? handleChangeConversationAvatar : undefined}
            role={isGroupConversation ? 'button' : undefined}
            tabIndex={isGroupConversation ? 0 : undefined}
            onKeyDown={(event) => {
              if (!isGroupConversation) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleChangeConversationAvatar()
              }
            }}
            title={isGroupConversation ? 'Nhấn để đổi ảnh đại diện nhóm' : undefined}
            aria-label={isUpdatingGroupAvatar ? 'Đang cập nhật ảnh nhóm' : 'Đổi ảnh đại diện nhóm'}
          >
            {headerAvatar ? (
              <img src={headerAvatar} alt={headerName} className="conversation-profile-avatar" />
            ) : (
              <div className="conversation-profile-avatar placeholder">{(headerName[0] || '?').toUpperCase()}</div>
            )}
          </div>

          {isGroupConversation && (
            <input
              ref={groupAvatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              style={{ display: 'none' }}
              onChange={handleGroupAvatarFileChange}
            />
          )}

          <div className="conversation-profile-name-row">
            <h3>{headerName}</h3>
            <button
              type="button"
              className="icon-ghost"
              title={isGroupConversation ? 'Đổi tên nhóm' : 'Đặt lại biệt danh'}
              onClick={handleRenameConversationTitle}
            >
              <FiEdit2 />
            </button>
          </div>

          {!isGroupConversation ? (
            <div className="quick-actions-row">
              <button
                type="button"
                className={`quick-action-btn ${isMutedActive ? 'is-active' : ''}`}
                onClick={handleToggleMute}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  {isMutedActive ? <IoNotificationsOffOutline /> : <IoNotificationsOutline />}
                </span>
                <span>Tắt thông báo</span>
              </button>

              <button
                type="button"
                className={`quick-action-btn ${showMessageSearchModal ? 'is-active' : ''}`}
                onClick={handleOpenMessageSearch}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  <FiSearch />
                </span>
                <span>Tìm tin nhắn</span>
              </button>

              <button
                type="button"
                className={`quick-action-btn ${preference?.pinned ? 'is-active' : ''}`}
                onClick={handleTogglePin}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  {preference?.pinned ? <RiPushpin2Fill /> : <RiPushpin2Line />}
                </span>
                <span>Ghim</span>
              </button>

              <button
                type="button"
                className={`quick-action-btn ${showGroupBuilder ? 'is-active' : ''}`}
                onClick={handleOpenCreateGroupFromDirect}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  <RiGroupLine />
                </span>
                <span>Tạo nhóm với người này</span>
              </button>
            </div>
          ) : (
            <div className="quick-actions-row is-group">
              <button
                type="button"
                className={`quick-action-btn ${isMutedActive ? 'is-active' : ''}`}
                onClick={handleToggleMute}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  {isMutedActive ? <IoNotificationsOffOutline /> : <IoNotificationsOutline />}
                </span>
                <span>Tắt thông báo</span>
              </button>

              <button
                type="button"
                className={`quick-action-btn ${showMessageSearchModal ? 'is-active' : ''}`}
                onClick={handleOpenMessageSearch}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  <FiSearch />
                </span>
                <span>Tìm tin nhắn</span>
              </button>

              <button
                type="button"
                className={`quick-action-btn ${preference?.pinned ? 'is-active' : ''}`}
                onClick={handleTogglePin}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  {preference?.pinned ? <RiPushpin2Fill /> : <RiPushpin2Line />}
                </span>
                <span>Ghim tin nhắn</span>
              </button>

              {canManageGroup && (
                <button
                  type="button"
                  className="quick-action-btn"
                  onClick={openAddMemberModal}
                >
                  <span className="quick-action-icon" aria-hidden="true">
                    <FiUserPlus />
                  </span>
                  <span>Thêm thành viên</span>
                </button>
              )}

              <button
                type="button"
                className="quick-action-btn"
                onClick={handleOpenGroupManagement}
              >
                <span className="quick-action-icon" aria-hidden="true">
                  <FiShield />
                </span>
                <span>Quản lý nhóm</span>
              </button>
            </div>
          )}

          {!isGroupConversation && showGroupBuilder && (
            <div className="group-builder">
              <div className="group-builder-title">
                {isGroupConversation ? 'Chọn bạn bè để thêm vào nhóm' : `Tạo nhóm với ${counterpart?.name || 'người này'}`}
              </div>
              <input
                type="text"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder={isGroupConversation ? 'Tìm theo tên hoặc số điện thoại' : 'Tên nhóm (không bắt buộc)'}
              />

              {loadingCandidates ? (
                <p className="group-builder-empty">Đang tải danh sách bạn bè...</p>
              ) : filteredGroupCandidates.length === 0 ? (
                <p className="group-builder-empty">Bạn cần thêm bạn bè để chọn thành viên bổ sung.</p>
              ) : (
                <div className="group-member-list">
                  {filteredGroupCandidates.map((user) => {
                    const userId = normalizeId(user?.userId || user?._id)
                    const name = user?.nickname || user?.displayName || user?.fullName || user?.username || userId
                    const phone = user?.phoneNumber || user?.phone || ''
                    const checked = selectedMemberIds.includes(userId)

                    return (
                      <label key={userId} className="group-member-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const isChecked = event.target.checked
                            setSelectedMemberIds((prev) =>
                              isChecked ? [...prev, userId] : prev.filter((id) => id !== userId)
                            )
                          }}
                        />
                        <span>{name} {phone ? `• ${phone}` : ''}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              <button
                type="button"
                className="group-create-btn"
                disabled={creatingGroup}
                onClick={isGroupConversation ? handleAddSelectedMembersToGroup : handleCreateGroup}
              >
                {creatingGroup ? 'Đang xử lý...' : isGroupConversation ? 'Thêm vào nhóm' : 'Tạo nhóm ngay'}
              </button>
            </div>
          )}

          {isGroupConversation && (
            <div className="group-quick-rows">
              <button type="button" className="info-row" onClick={handleOpenGroupMembers}>
                <div className="left">
                  <FiUsers />
                  <span>Thành viên nhóm ({groupMemberRecords.length})</span>
                </div>
                <FiChevronRight className="chevron-right" />
              </button>
            </div>
          )}
        </section>

        <section className="conversation-statistics">
          <button type="button" className="info-row" onClick={handleOpenReminderList}>
            <div className="left">
              <FiClock />
              <span>Danh sách nhắc hẹn</span>
            </div>
            <FiChevronRight className="chevron-right" />
          </button>

          {isGroupConversation ? (
            <button type="button" className="info-row" onClick={openAddMemberModal}>
              <div className="left">
                <FiUserPlus />
                <span>Thêm thành viên</span>
              </div>
              <FiChevronRight className="chevron-right" />
            </button>
          ) : (
            <div className="info-row static">
              <div className="left">
                <FiUsers />
                <span>{sharedGroupCount} nhóm chung</span>
              </div>
            </div>
          )}
        </section>

        <section className="conversation-dropdown-section">
          <button type="button" className="section-header" onClick={() => toggleSection('media')}>
            <span>Ảnh/Video</span>
            {expandedSections.media ? <FiChevronUp /> : <FiChevronDown />}
          </button>

          {expandedSections.media && (
            <div className="section-content">
              {displayedMedia.length === 0 ? (
                <p className="section-empty">Chưa có ảnh/video được chia sẻ.</p>
              ) : (
                <div className="media-grid">
                  {displayedMedia.map((item) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="media-cell">
                      {item.type === 'video' ? (
                        <video src={item.url} preload="metadata" />
                      ) : (
                        <img src={item.url} alt={item.name} loading="lazy" />
                      )}
                    </a>
                  ))}
                </div>
              )}

              {mediaItems.length > 8 && (
                <button type="button" className="wide-link-button" onClick={() => setShowAllMedia((prev) => !prev)}>
                  {showAllMedia ? 'Thu gọn' : 'Xem tất cả'}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="conversation-dropdown-section">
          <button type="button" className="section-header" onClick={() => toggleSection('file')}>
            <span>File</span>
            {expandedSections.file ? <FiChevronUp /> : <FiChevronDown />}
          </button>

          {expandedSections.file && (
            <div className="section-content">
              {displayedFiles.length === 0 ? (
                <p className="section-empty">Chưa có tệp đã chia sẻ.</p>
              ) : (
                <div className="file-list">
                  {displayedFiles.map((item) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="file-item">
                      <FiFileText />
                      <div>
                        <strong>{item.name}</strong>
                        <small>{formatFileSize(item.size)} • {formatDate(item.createdAt)}</small>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {fileItems.length > 4 && (
                <button type="button" className="wide-link-button" onClick={() => setShowAllFiles((prev) => !prev)}>
                  {showAllFiles ? 'Thu gọn' : 'Xem tất cả'}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="conversation-dropdown-section">
          <button type="button" className="section-header" onClick={() => toggleSection('link')}>
            <span>Link</span>
            {expandedSections.link ? <FiChevronUp /> : <FiChevronDown />}
          </button>

          {expandedSections.link && (
            <div className="section-content">
              {displayedLinks.length === 0 ? (
                <p className="section-empty">Chưa có liên kết đã chia sẻ.</p>
              ) : (
                <div className="file-list">
                  {displayedLinks.map((item) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="file-item link-item">
                      <FiLink />
                      <div>
                        <strong>{item.url}</strong>
                        <small>{formatDate(item.createdAt)}</small>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {linkItems.length > 4 && (
                <button type="button" className="wide-link-button" onClick={() => setShowAllLinks((prev) => !prev)}>
                  {showAllLinks ? 'Thu gọn' : 'Xem tất cả'}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="conversation-dropdown-section">
          <button type="button" className="section-header" onClick={() => toggleSection('privacy')}>
            <span>Thiết lập bảo mật</span>
            {expandedSections.privacy ? <FiChevronUp /> : <FiChevronDown />}
          </button>

          {expandedSections.privacy && (
            <div className="section-content privacy-content">
              <div className="privacy-row">
                <div className="left">
                  <FiClock />
                  <div>
                    <strong>Tin nhắn tự xóa</strong>
                    <small>
                      {autoDeleteLabel}
                    </small>
                  </div>
                </div>
                <select value={autoDeleteValue} onChange={handleChangeAutoDelete}>
                  {AUTO_DELETE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="privacy-row">
                <div className="left">
                  {preference?.hidden ? <FiEyeOff /> : <FiEye />}
                  <strong>Ẩn trò chuyện</strong>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={Boolean(preference?.hidden)} onChange={handleToggleHidden} />
                  <span className="slider" />
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="conversation-dropdown-section chat-background-section">
          <div className="section-header static-title">Tùy chỉnh nền chat</div>
          <div className="section-content">
            <div className="chat-background-options">
              {CHAT_BACKGROUND_OPTIONS.map((option) => {
                const active = (preference?.chatBackground || 'default') === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`chat-background-swatch ${active ? 'active' : ''}`}
                    onClick={() => handleSelectChatBackground(option.value)}
                    title={option.label}
                    aria-label={option.label}
                  >
                    <span className="swatch-preview" style={{ '--tone-1': option.preview[0], '--tone-2': option.preview[1], '--tone-3': option.preview[2] }} />
                    <span className="swatch-label">{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <footer className="conversation-action-footer">
          <button type="button" className="footer-action" onClick={handleReportConversation}>
            <FiAlertTriangle />
            <span>Báo xấu</span>
          </button>

          {isGroupConversation && (
            <button
              type="button"
              className="footer-action danger"
              onClick={canDissolveGroup ? handleDissolveGroup : handleLeaveGroup}
            >
              {canDissolveGroup ? <FiTrash2 /> : <FiUnlock />}
              <span>{canDissolveGroup ? 'Giải tán nhóm' : 'Rời nhóm'}</span>
            </button>
          )}

          <button type="button" className="footer-action danger" onClick={handleDeleteHistory}>
            <FiTrash2 />
            <span>Xóa lịch sử trò chuyện</span>
          </button>
        </footer>
      </aside>

      {showGroupManagementView && isGroupConversation && (
        <aside className="group-management-overlay" onClick={(event) => event.stopPropagation()}>
          <header className="group-management-header">
            <button
              type="button"
              className="icon-ghost"
              onClick={() => setShowGroupManagementView(false)}
              aria-label="Quay lại"
            >
              <FiChevronLeft />
            </button>
            <h3>Quản lý nhóm</h3>
            <span className="group-management-header-spacer" aria-hidden="true" />
          </header>

          <div className="group-management-note">
            <FiShield />
            <span>Bạn có quyền quản lý nhóm này</span>
          </div>

          <div className="group-management-body">
            <div className="group-management-block-title">Cho phép các thành viên trong nhóm:</div>

            <div className="group-management-row">
              <span>Thay đổi tên & ảnh đại diện của nhóm</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(groupSettings?.allowMemberEditGroupInfo)}
                  onChange={() => handleUpdateGroupSetting({ allowMemberEditGroupInfo: !Boolean(groupSettings?.allowMemberEditGroupInfo) })}
                  disabled={!canOperateAdminControls}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="group-management-row">
              <span>Ghim tin nhắn, ghi chú, bình chọn lên đầu hội thoại</span>
              <label className="switch">
                <input type="checkbox" checked disabled />
                <span className="slider" />
              </label>
            </div>

            <div className="group-management-row">
              <span>Tạo mới ghi chú, nhắc hẹn</span>
              <label className="switch">
                <input type="checkbox" checked disabled />
                <span className="slider" />
              </label>
            </div>

            <div className="group-management-row">
              <span>Tạo mới bình chọn</span>
              <label className="switch">
                <input type="checkbox" checked disabled />
                <span className="slider" />
              </label>
            </div>

            <div className="group-management-row">
              <span>Gửi tin nhắn</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!Boolean(groupSettings?.adminOnlyMessaging)}
                  onChange={() => handleUpdateGroupSetting({ adminOnlyMessaging: !Boolean(groupSettings?.adminOnlyMessaging) })}
                  disabled={!canOperateAdminControls}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="group-management-divider" />

            <div className="group-management-row">
              <div className="group-management-label-wrap">
                <span>Chế độ phê duyệt thành viên mới</span>
                <small>Chỉ admin/phó nhóm duyệt thành viên mới</small>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(groupSettings?.requiresAdminApproval)}
                  onChange={() => handleUpdateGroupSetting({ requiresAdminApproval: !Boolean(groupSettings?.requiresAdminApproval) })}
                  disabled={!canOperateAdminControls}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="group-management-row">
              <div className="group-management-label-wrap">
                <span>Đánh dấu tin nhắn từ trưởng/phó nhóm</span>
                <small>Ưu tiên hiển thị khi được @nhắc tên</small>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={String(groupSettings?.groupNotificationFilter || 'all') === 'mention'}
                  onChange={() => handleUpdateGroupSetting({ groupNotificationFilter: (groupSettings?.groupNotificationFilter || 'all') === 'mention' ? 'all' : 'mention' })}
                  disabled={!canOperateAdminControls}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="group-management-row">
              <div className="group-management-label-wrap">
                <span>Cho phép thành viên mới đọc tin nhắn gần nhất</span>
                <small>Bật để thấy lịch sử trước khi tham gia</small>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={String(groupSettings?.newMemberHistoryVisibility || 'all') === 'all'}
                  onChange={() => handleUpdateGroupSetting({ newMemberHistoryVisibility: (groupSettings?.newMemberHistoryVisibility || 'all') === 'all' ? 'from_join' : 'all' })}
                  disabled={!canOperateAdminControls}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </aside>
      )}

      {showGroupMembersView && isGroupConversation && (
        <aside className="group-members-overlay" onClick={(event) => event.stopPropagation()}>
          <header className="group-management-header">
            <button
              type="button"
              className="icon-ghost"
              onClick={() => setShowGroupMembersView(false)}
              aria-label="Quay lại"
            >
              <FiChevronLeft />
            </button>
            <h3>Thành viên nhóm</h3>
            <span className="group-management-header-spacer" aria-hidden="true" />
          </header>

          <div className="group-members-body">
            {isLoadingGroupProfiles || loadingGroupAdminData ? (
              <p className="section-empty">Đang tải danh sách thành viên...</p>
            ) : (
              <div className="group-member-role-list">
                {filteredGroupMembers.map((member) => (
                  <div key={member.userId} className="group-member-role-item">
                    <div className="member-identity">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.displayName} className="member-avatar" />
                      ) : (
                        <span className="member-avatar placeholder">{(member.displayName[0] || '?').toUpperCase()}</span>
                      )}

                      <div>
                        <strong>{member.displayName}</strong>
                        {member.phone ? <small>{member.phone}</small> : null}
                      </div>
                    </div>

                    <div className="member-role-actions">
                      <span className={`role-pill role-${member.role}`}>
                        {member.role === 'admin' ? '👑 Trưởng nhóm' : member.role === 'moderator' ? '🥈 Phó nhóm' : 'Thành viên'}
                      </span>

                      {canOperateAdminControls && member.role !== 'admin' && (
                        <>
                          {isCurrentUserAdmin && (
                            <button type="button" onClick={() => handleToggleModerator(member)}>
                              {member.role === 'moderator' ? 'Bãi nhiệm' : 'Chỉ định phó'}
                            </button>
                          )}
                          <button type="button" className="danger-inline" onClick={() => handleRemoveGroupMember(member)}>
                            Xóa
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {showMuteDurationPicker && (
        <div className="info-modal-overlay" onClick={() => setShowMuteDurationPicker(false)}>
          <div className="info-modal" onClick={(event) => event.stopPropagation()}>
            <div className="info-modal-header">
              <h4>Tắt thông báo trong bao lâu?</h4>
              <button type="button" onClick={() => setShowMuteDurationPicker(false)} aria-label="Đóng chọn thời gian">
                <FiX />
              </button>
            </div>

            <div className="info-modal-body">
              <div className="mute-duration-options">
                {MUTE_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`mute-duration-btn ${preference?.muteDuration === option.value && isMutedActive ? 'selected' : ''}`}
                    onClick={() => handleSelectMuteDuration(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {isMutedActive && (
                <div className="mute-duration-current">
                  <small>
                    Đang tắt thông báo
                    {muteDurationLabel ? `: ${muteDurationLabel}` : ''}
                  </small>
                  <button type="button" onClick={handleTurnOnNotifications}>Bật lại ngay</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showMessageSearchModal && (
        <div className="info-modal-overlay" onClick={() => setShowMessageSearchModal(false)}>
          <div className="info-modal" onClick={(event) => event.stopPropagation()}>
            <div className="info-modal-header">
              <h4>Tìm tin nhắn trong đoạn chat</h4>
              <button type="button" onClick={() => setShowMessageSearchModal(false)} aria-label="Đóng tìm kiếm tin nhắn">
                <FiX />
              </button>
            </div>

            <div className="info-modal-body">
              <input
                className="message-search-input"
                type="text"
                value={messageSearchText}
                onChange={(event) => setMessageSearchText(event.target.value)}
                placeholder="Nhập từ khóa cần tìm..."
                autoFocus
              />

              {!messageSearchText.trim() ? (
                <p className="section-empty" style={{ marginTop: 10 }}>Nhập từ khóa để tìm tin nhắn trong cuộc trò chuyện.</p>
              ) : messageSearchResults.length === 0 ? (
                <p className="section-empty" style={{ marginTop: 10 }}>Không tìm thấy tin nhắn phù hợp.</p>
              ) : (
                <div className="message-search-results">
                  {messageSearchResults.map((item) => (
                    <div key={item.id} className="message-search-item">
                      <span className="message-search-sender">Người gửi: {item.senderName || 'Không xác định'}</span>
                      <strong>{item.content}</strong>
                      <small>{formatDate(item.createdAt)}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddMemberModal && isGroupConversation && (
        <div className="info-modal-overlay" onClick={() => setShowAddMemberModal(false)}>
          <div className="info-modal" onClick={(event) => event.stopPropagation()}>
            <div className="info-modal-header">
              <h4>Thêm thành viên vào nhóm</h4>
              <button type="button" onClick={() => setShowAddMemberModal(false)} aria-label="Đóng thêm thành viên">
                <FiX />
              </button>
            </div>

            <div className="info-modal-body">
              <input
                type="text"
                value={addMemberSearchText}
                onChange={(event) => setAddMemberSearchText(event.target.value)}
                placeholder="Tìm theo tên hoặc số điện thoại"
              />

              {loadingCandidates ? (
                <p className="group-builder-empty">Đang tải danh sách bạn bè đã kết bạn...</p>
              ) : filteredGroupCandidates.length === 0 ? (
                <p className="group-builder-empty">Không có bạn bè phù hợp để thêm vào nhóm.</p>
              ) : (
                <div className="group-member-list" style={{ marginTop: 10, maxHeight: 220 }}>
                  {filteredGroupCandidates.map((user) => {
                    const userId = normalizeId(user?.userId || user?._id)
                    const name = user?.nickname || user?.displayName || user?.fullName || user?.username || userId
                    const phone = user?.phoneNumber || user?.phone || ''
                    const checked = selectedMemberIds.includes(userId)

                    return (
                      <label key={userId} className="group-member-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const isChecked = event.target.checked
                            setSelectedMemberIds((prev) =>
                              isChecked ? [...prev, userId] : prev.filter((id) => id !== userId)
                            )
                          }}
                        />
                        <span>{name} {phone ? `• ${phone}` : ''}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="group-inline-actions" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="neutral-inline-btn" onClick={() => setShowAddMemberModal(false)}>
                  Hủy
                </button>
                <button
                  type="button"
                  className="primary-inline-btn"
                  disabled={creatingGroup || selectedMemberIds.length === 0}
                  onClick={handleAddSelectedMembersToGroup}
                >
                  {creatingGroup ? 'Đang xử lý...' : `Thêm (${selectedMemberIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConversationInfoPanel
