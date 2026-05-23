import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom'
import {
  FiAlertTriangle,
  FiCamera,
  FiCheckCircle,
  FiCornerUpLeft,
  FiCrosshair,
  FiFilter,
  FiImage,
  FiMap,
  FiMapPin,
  FiMessageCircle,
  FiMinus,
  FiPlus,
  FiRefreshCcw,
  FiSend,
  FiSmile,
  FiThumbsUp,
  FiUsers,
  FiX,
} from 'react-icons/fi'
import {
  FaBolt,
  FaCarSide,
  FaDroplet,
  FaHelmetSafety,
  FaLightbulb,
  FaLocationDot,
  FaTrashCan,
  FaTree,
  FaWater,
} from 'react-icons/fa6'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import apiClient, { API_URL, postService, userService } from '../services/api'
import { getSocket, initSocket } from '../services/socket'
import useAuthStore from '../store/authStore'
import { formatLocationLabel, getLocationInputPlaceholder } from '../utils/addressFormat.js'
import AssistantPage from './AssistantPage'
import '../styles/UrbanPage.css'

const categories = [
  ['electricity', 'Điện'],
  ['water', 'Nước'],
  ['traffic', 'Giao thông'],
  ['tree', 'Cây xanh'],
  ['flood', 'Ngập nước'],
  ['waste', 'Rác thải'],
  ['street_light', 'Đèn đường'],
  ['construction', 'Công trình'],
  ['other', 'Khác'],
]

const categoryMarkerSymbols = {
  electricity: FaBolt,
  water: FaDroplet,
  traffic: FaCarSide,
  tree: FaTree,
  flood: FaWater,
  waste: FaTrashCan,
  street_light: FaLightbulb,
  construction: FaHelmetSafety,
  other: FaLocationDot,
}

const categoryMarkerColors = {
  electricity: '#f59e0b',
  water: '#0ea5e9',
  traffic: '#ef4444',
  tree: '#16a34a',
  flood: '#2563eb',
  waste: '#7c3aed',
  street_light: '#facc15',
  construction: '#ea580c',
  other: '#64748b',
}

const statusMarkerColors = {
  pending: '#f59e0b',
  in_progress: '#0ea5e9',
  resolved: '#22c55e',
}

const statuses = [
  ['pending', 'Chờ xử lý'],
  ['in_progress', 'Đang xử lý'],
  ['resolved', 'Đã xử lý'],
]

const severities = [
  ['low', 'Thấp'],
  ['medium', 'Trung bình'],
  ['high', 'Cao'],
  ['critical', 'Khẩn cấp'],
]

const MAX_POST_IMAGES = 6
const MAX_POST_IMAGE_SIZE = 8 * 1024 * 1024
const DEFAULT_FEED_PROVINCE = 'Thành phố Hồ Chí Minh'

const categoryLabel = (value) => categories.find(([key]) => key === value)?.[1] || 'Khác'
const statusLabel = (value) => statuses.find(([key]) => key === value)?.[1] || 'Chờ xử lý'
const severityLabel = (value) => severities.find(([key]) => key === value)?.[1] || 'Trung bình'
const parseImageUrls = (value = '') => String(value).split(/\n|,/).map((item) => item.trim()).filter(Boolean)
const getPostImages = (post) => Array.isArray(post?.images) ? post.images.filter(Boolean) : []
const getCurrentUserId = (user) => String(user?.userId || user?._id || user?.id || '')
const toComparableRegion = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const toRegionKey = (value = '') => {
  const comparable = toComparableRegion(value)
  if (!comparable) return ''
  if (
    comparable.includes('ho chi minh') ||
    comparable.includes('sai gon') ||
    comparable === 'hcm' ||
    comparable === 'tphcm' ||
    comparable === 'tp hcm'
  ) return 'ho chi minh'
  if (comparable.includes('ha noi')) return 'ha noi'
  const districtNumber = comparable.match(/^(q|quan)\s*(\d{1,2})$/)
  if (districtNumber) return `quan ${districtNumber[2]}`
  if (comparable.includes('thu duc')) return 'thu duc'
  return comparable
}
const getFeedRegion = (user) => ({
  province: String(user?.province || user?.location?.province || DEFAULT_FEED_PROVINCE).trim(),
  district: String(user?.district || user?.location?.district || '').trim(),
})
const rankPostForRegion = (post, region) => {
  const userProvince = toRegionKey(region?.province)
  const userDistrict = toRegionKey(region?.district)
  const postProvince = toRegionKey(post?.location?.province)
  const postDistrict = toRegionKey(post?.location?.district)
  if (userDistrict && userProvince && userDistrict === postDistrict && userProvince === postProvince) return 0
  if (userProvince && userProvince === postProvince) return 1
  return 2
}
const compareCreatedAtDesc = (a, b) => {
  const createdAtA = Date.parse(a?.createdAt || '')
  const createdAtB = Date.parse(b?.createdAt || '')
  const hasCreatedAtA = Number.isFinite(createdAtA)
  const hasCreatedAtB = Number.isFinite(createdAtB)

  if (hasCreatedAtA && hasCreatedAtB && createdAtA !== createdAtB) {
    return createdAtB - createdAtA
  }
  if (hasCreatedAtA !== hasCreatedAtB) {
    return hasCreatedAtB ? 1 : -1
  }
  return String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''))
}
const sortPostsForFeed = (posts, region) => {
  return [...posts].sort((a, b) => {
    const regionDiff = rankPostForRegion(a, region) - rankPostForRegion(b, region)
    if (regionDiff !== 0) return regionDiff
    return compareCreatedAtDesc(a, b)
  })
}
const matchesFeedFilters = (post, filters) => {
  if (filters?.category && post?.category !== filters.category) return false
  if (filters?.status && post?.status !== filters.status) return false
  return true
}
const getAuthorId = (post) => String(post?.authorId || '')
const getPostCoordinates = (post) => {
  const lat = Number(post?.location?.lat)
  const lng = Number(post?.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}
const getPostMapHref = (post) => {
  const coordinates = getPostCoordinates(post)
  if (!coordinates) return '/urban/map'
  const params = new URLSearchParams({
    postId: post.postId,
    lat: String(coordinates.lat),
    lng: String(coordinates.lng),
  })
  return `/urban/map?${params.toString()}`
}
const getProfileDisplayName = (profile) => (
  profile?.nickname ||
  profile?.displayName ||
  profile?.fullName ||
  profile?.username ||
  ''
)
const toCoordinateNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : null
}
const createLocalImageItem = (file) => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
  file,
  previewUrl: URL.createObjectURL(file),
})

const uploadPostImageFile = async (file) => {
  const uploadResponse = await postService.uploadImage(file)
  const uploadData = uploadResponse?.data || {}
  if (!uploadData.url) throw new Error('Không nhận được URL ảnh đã tải lên')
  return uploadData.url
}

const getReactionCount = (post, type) => Array.isArray(post?.reactions?.[type]) ? post.reactions[type].length : 0
const hasReacted = (post, type, userId) => {
  if (!userId) return false
  return (post?.reactions?.[type] || []).map(String).includes(String(userId))
}
const getTotalReactionCount = (post) => Object.values(post?.reactions || {}).reduce(
  (total, users) => total + (Array.isArray(users) ? users.length : 0),
  0
)
const upsertCommentInCollection = (comments = [], nextComment) => {
  if (!nextComment?.commentId) return comments
  return [nextComment, ...comments.filter((item) => item?.commentId !== nextComment.commentId)]
}

const getAuthorLabel = (item, profileMap = {}, currentUser = null) => {
  const authorId = getAuthorId(item)
  if (authorId && authorId === getCurrentUserId(currentUser)) {
    const currentUserName = getProfileDisplayName(currentUser)
    if (currentUserName) return currentUserName
  }
  const profileName = getProfileDisplayName(profileMap[authorId])
  return profileName || 'Cư dân đô thị'
}

const getAuthorAvatar = (item, profileMap = {}, currentUser = null) => {
  const authorId = getAuthorId(item)
  if (authorId && authorId === getCurrentUserId(currentUser)) {
    return String(currentUser?.avatar || currentUser?.photoURL || currentUser?.profilePicture || '')
  }

  return String(
    item?.user?.avatar ||
    item?.user?.photoURL ||
    item?.user?.profilePicture ||
    profileMap[authorId]?.avatar ||
    profileMap[authorId]?.photoURL ||
    profileMap[authorId]?.profilePicture ||
    ''
  )
}

const getInitial = (item, profileMap = {}, currentUser = null) => getAuthorLabel(item, profileMap, currentUser).charAt(0).toUpperCase()

const formatPostTime = (value) => {
  if (!value) return 'Vừa xong'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Vừa xong'

  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (diffMinutes < 1) return 'Vừa xong'
  if (diffMinutes < 60) return `${diffMinutes} phút`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} giờ`
  return date.toLocaleDateString('vi-VN')
}

const isIgnorableMapTileError = (event) => {
  const statusCode = Number(event?.error?.status || event?.error?.statusCode || 0)
  const message = String(event?.error?.message || '')
  if (statusCode === 404 && /tile not found/i.test(message)) return true
  return /404/.test(message) && /tile not found/i.test(message)
}

const createPostPopupNode = (post) => {
  const wrap = document.createElement('div')
  wrap.className = 'urban-map-popup'

  const head = document.createElement('div')
  head.className = 'urban-map-popup-head'

  const title = document.createElement('strong')
  title.textContent = categoryLabel(post.category)
  head.appendChild(title)

  const status = document.createElement('span')
  status.className = `urban-popup-status status-${post.status}`
  status.textContent = statusLabel(post.status)
  head.appendChild(status)
  wrap.appendChild(head)

  const content = document.createElement('p')
  content.textContent = post.content || 'Không có mô tả'
  wrap.appendChild(content)

  if (formatLocationLabel(post.location)) {
    const address = document.createElement('small')
    address.textContent = formatLocationLabel(post.location)
    wrap.appendChild(address)
  }

  const link = document.createElement('a')
  link.href = `/urban/posts/${post.postId}`
  link.textContent = 'Xem chi tiết'
  wrap.appendChild(link)

  return wrap
}

const getCategoryMarkerIcon = (category) => categoryMarkerSymbols[category] || categoryMarkerSymbols.other
const renderCategoryMarkerIcon = (category, className) => {
  const Icon = getCategoryMarkerIcon(category)
  return renderToStaticMarkup(<Icon className={className} aria-hidden="true" focusable="false" />)
}

const UrbanShell = ({ children, mainClassName = '', navClassName = '' }) => (
  <main className="urban-page">
    <section className={`urban-main ${mainClassName}`.trim()}>
      <nav className={`urban-top-nav ${navClassName}`.trim()} aria-label="Điều hướng đô thị">
        <NavLink to="/urban" end>Bảng tin</NavLink>
        <NavLink to="/urban/map">Bản đồ</NavLink>
      </nav>
      {children}
    </section>
  </main>
)

const LocationMapPicker = ({ lat, lng, onPick }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  const placeMarker = useCallback((map, nextLng, nextLat) => {
    const coordinates = [nextLng, nextLat]
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: '#2563eb', draggable: true })
        .setLngLat(coordinates)
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const markerCoordinates = markerRef.current.getLngLat()
        onPick({
          lat: markerCoordinates.lat.toFixed(6),
          lng: markerCoordinates.lng.toFixed(6),
        })
      })
      return
    }
    markerRef.current.setLngLat(coordinates)
  }, [onPick])

  const pickCoordinates = useCallback((nextLng, nextLat) => {
    if (!Number.isFinite(nextLng) || !Number.isFinite(nextLat)) return
    const map = mapRef.current
    if (map) {
      placeMarker(map, nextLng, nextLat)
      map.easeTo({ center: [nextLng, nextLat], zoom: Math.max(map.getZoom(), 15), duration: 450 })
    }
    onPick({
      lat: nextLat.toFixed(6),
      lng: nextLng.toFixed(6),
    })
  }, [onPick, placeMarker])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    let disposed = false
    const currentLat = toCoordinateNumber(lat)
    const currentLng = toCoordinateNumber(lng)
    const center = currentLat !== null && currentLng !== null ? [currentLng, currentLat] : [106.7019, 10.7758]

    const initializeMap = async () => {
      setStatus('loading')
      setError('')
      try {
        const styleResponse = await apiClient.get('/maps/style')
        if (disposed) return

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: styleResponse.data,
          center,
          zoom: currentLat !== null && currentLng !== null ? 15 : 12,
          attributionControl: false,
          transformRequest: (url) => {
            if (url.startsWith(`${API_URL}/maps`) || url.includes('/api/maps/')) {
              const token = useAuthStore.getState()?.accessToken
              return {
                url,
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              }
            }
            return { url }
          },
        })

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('load', () => {
          setStatus('ready')
          map.resize()
          if (currentLat !== null && currentLng !== null) {
            placeMarker(map, currentLng, currentLat)
          }
        })
        map.on('click', (event) => {
          pickCoordinates(event.lngLat.lng, event.lngLat.lat)
        })
        map.on('error', (event) => {
          if (isIgnorableMapTileError(event)) return
          setStatus('error')
          setError(event?.error?.message || 'Không thể tải bản đồ chọn vị trí')
        })

        mapRef.current = map
      } catch (err) {
        if (disposed) return
        setStatus('error')
        setError(err?.response?.data?.error || 'Không thể tải bản đồ chọn vị trí')
      }
    }

    initializeMap()

    return () => {
      disposed = true
      markerRef.current?.remove()
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [pickCoordinates, placeMarker])

  useEffect(() => {
    const map = mapRef.current
    const currentLat = toCoordinateNumber(lat)
    const currentLng = toCoordinateNumber(lng)
    if (!map || currentLat === null || currentLng === null) return
    placeMarker(map, currentLng, currentLat)
  }, [lat, lng, placeMarker])

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ lấy vị trí hiện tại')
      return
    }
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        pickCoordinates(position.coords.longitude, position.coords.latitude)
      },
      () => setError('Không thể lấy vị trí hiện tại. Hãy cấp quyền vị trí hoặc chọn trên bản đồ.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <section className="urban-map-picker">
      <div className="urban-map-picker-header">
        <div>
          <strong>Chọn vị trí trên bản đồ</strong>
          <span>Click vào vị trí sự cố hoặc kéo marker để chỉnh chính xác.</span>
        </div>
        <button type="button" onClick={useCurrentLocation}><FiMapPin /> Vị trí hiện tại</button>
      </div>
      <div ref={containerRef} className="urban-map-picker-canvas" />
      {status === 'loading' ? <div className="urban-map-picker-overlay">Đang tải bản đồ...</div> : null}
      {error ? <p className="urban-map-picker-error">{error}</p> : null}
    </section>
  )
}

const PostCard = ({
  post,
  onReact,
  currentUser,
  currentUserId,
  profileMap,
  isCommentsExpanded = false,
  comments = [],
  commentDraft = '',
  replyDraft = '',
  replyingTo = '',
  loadingComments = false,
  onToggleComments,
  onCommentDraftChange,
  onSubmitComment,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
  onCommentReact,
}) => {
  const images = getPostImages(post)
  const visibleImages = images.slice(0, 3)
  const hiddenImageCount = Math.max(images.length - visibleImages.length, 0)
  const coordinates = getPostCoordinates(post)
  const hasEmotion = hasReacted(post, 'like', currentUserId)
  const hasMarkedImportant = hasReacted(post, 'urgent', currentUserId)
  const commentThreads = useMemo(() => groupComments(comments), [comments])

  return (
    <article className="urban-post-card">
      <div className="urban-post-author">
        <div className="urban-avatar">
          {getAuthorAvatar(post, profileMap, currentUser) ? (
            <img src={getAuthorAvatar(post, profileMap, currentUser)} alt={getAuthorLabel(post, profileMap, currentUser)} loading="lazy" />
          ) : (
            getInitial(post, profileMap, currentUser)
          )}
        </div>
        <div className="urban-author-main">
          <div className="urban-author-line">
            <Link to={`/urban/posts/${post.postId}`}>{getAuthorLabel(post, profileMap, currentUser)}</Link>
            <span className={`urban-status-dot status-${post.status}`} />
          </div>
          <div className="urban-post-meta">
            <span>{formatPostTime(post.createdAt)}</span>
            <span>•</span>
            <span>{categoryLabel(post.category)}</span>
            {formatLocationLabel(post.location) ? (
              <>
                <span>•</span>
                {coordinates ? (
                  <Link className="urban-map-link" to={getPostMapHref(post)}>
                    <FiMapPin /> {formatLocationLabel(post.location)}
                  </Link>
                ) : (
                  <span>{formatLocationLabel(post.location)}</span>
                )}
              </>
            ) : null}
          </div>
        </div>
        <span className={`urban-status status-${post.status}`}>{statusLabel(post.status)}</span>
      </div>
      <Link className="urban-post-content" to={`/urban/posts/${post.postId}`}>
        {post.content}
      </Link>
      {coordinates ? (
        <Link className="urban-post-location" to={getPostMapHref(post)}>
          <FiMapPin />
          <span>{formatLocationLabel(post.location) || `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`}</span>
          <strong>Xem trên bản đồ</strong>
        </Link>
      ) : null}
      {visibleImages.length > 0 ? (
        <div className={`urban-images image-count-${Math.min(visibleImages.length, 3)}`}>
          {visibleImages.map((url, index) => (
            <div key={`${url}-${index}`} className="urban-image-frame">
              <img src={url} alt={`Ảnh báo cáo sự cố ${index + 1}`} loading="lazy" />
              {index === visibleImages.length - 1 && hiddenImageCount > 0 ? (
                <span className="urban-image-more">+{hiddenImageCount}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Link className="urban-image-placeholder" to={`/urban/posts/${post.postId}`}>
          <FiCamera />
          <span>{categoryLabel(post.category)}</span>
          <small>Thêm ảnh hiện trường giúp báo cáo dễ xử lý hơn</small>
        </Link>
      )}
      <div className="urban-post-stats">
        <span><FiThumbsUp /> {getTotalReactionCount(post)} lượt quan tâm</span>
        <Link to={`/urban/posts/${post.postId}`}><FiMessageCircle /> {post.commentCount || 0} bình luận</Link>
      </div>
      <footer className="urban-actions">
        <button
          type="button"
          className={hasEmotion ? 'active' : ''}
          aria-pressed={hasEmotion}
          onClick={() => onReact(post, 'like', hasEmotion)}
        >
          <FiSmile /> Cảm xúc {getReactionCount(post, 'like') || ''}
        </button>
        <button type="button" className={isCommentsExpanded ? 'active' : ''} onClick={() => onToggleComments(post.postId)}>
          <FiMessageCircle /> Bình luận {post.commentCount || ''}
        </button>
        <button
          type="button"
          className={hasMarkedImportant ? 'active important' : 'important'}
          aria-pressed={hasMarkedImportant}
          onClick={() => onReact(post, 'urgent', hasMarkedImportant)}
        >
          <FiAlertTriangle /> Quan trọng {getReactionCount(post, 'urgent') || ''}
        </button>
      </footer>
      {isCommentsExpanded ? (
        <section className="urban-inline-comments">
          <form
            className="urban-inline-comment-form"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmitComment(post.postId)
            }}
          >
            <input
              value={commentDraft}
              onChange={(event) => onCommentDraftChange(post.postId, event.target.value)}
              placeholder="Viết bình luận nhanh..."
            />
            <button type="submit" className="urban-inline-send" aria-label="Gửi bình luận">
              <FiSend />
            </button>
          </form>
          {loadingComments ? <p className="urban-muted">Đang tải bình luận...</p> : null}
          {!loadingComments && commentThreads.length === 0 ? <p className="urban-muted">Chưa có bình luận nào.</p> : null}
          {!loadingComments && commentThreads.length > 0 ? (
            <div className="urban-inline-comment-tree">
              {commentThreads.map((item) => (
                <CommentItem
                  key={item.commentId}
                  item={item}
                  replies={item.replies}
                  profileMap={profileMap}
                  currentUser={currentUser}
                  currentUserId={currentUserId}
                  replyingTo={replyingTo}
                  replyText={replyDraft}
                  onStartReply={onStartReply}
                  onCancelReply={onCancelReply}
                  onReplyTextChange={onReplyDraftChange}
                  onSubmitReply={onSubmitReply}
                  onReact={onCommentReact}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}

export const UrbanFeedPage = () => {
  const currentUser = useAuthStore((state) => state.user)
  const [posts, setPosts] = useState([])
  const [filters, setFilters] = useState({ category: '', status: '' })
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'other',
    severity: 'medium',
    address: '',
    lat: '',
    lng: '',
    imagesText: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [localImages, setLocalImages] = useState([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [profileMap, setProfileMap] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const [commentsByPost, setCommentsByPost] = useState({})
  const [loadingCommentsByPost, setLoadingCommentsByPost] = useState({})
  const [commentDraftByPost, setCommentDraftByPost] = useState({})
  const [replyingToByPost, setReplyingToByPost] = useState({})
  const [replyDraftByPost, setReplyDraftByPost] = useState({})
  const imageInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const localImagesRef = useRef([])
  const loadingProfileIdsRef = useRef(new Set())
  const imagePreviewUrls = useMemo(() => parseImageUrls(form.imagesText), [form.imagesText])
  const currentUserId = useMemo(() => getCurrentUserId(currentUser), [currentUser])
  const feedRegion = useMemo(() => getFeedRegion(currentUser), [currentUser])

  const missingAuthorIds = useMemo(() => {
    const ids = new Set()
    const collectAuthorId = (item) => {
      const authorId = getAuthorId(item)
      if (!authorId || profileMap[authorId] || loadingProfileIdsRef.current.has(authorId)) return
      ids.add(authorId)
    }
    posts.forEach(collectAuthorId)
    Object.values(commentsByPost).flat().forEach(collectAuthorId)
    return Array.from(ids)
  }, [commentsByPost, posts, profileMap])

  const applyPickedLocation = useCallback(({ lat: nextLat, lng: nextLng }) => {
    setForm((current) => ({
      ...current,
      lat: nextLat,
      lng: nextLng,
      address: current.address || '',
    }))
  }, [])

  useEffect(() => {
    localImagesRef.current = localImages
  }, [localImages])

  useEffect(() => {
    let isCancelled = false

    const fetchAuthorProfiles = async () => {
      if (missingAuthorIds.length === 0) return

      missingAuthorIds.forEach((authorId) => loadingProfileIdsRef.current.add(authorId))
      const responses = await Promise.allSettled(
        missingAuthorIds.map(async (authorId) => {
          const response = await userService.getProfile(authorId)
          return { authorId, profile: response?.data?.user || null }
        })
      )

      if (isCancelled) return

      const nextProfiles = {}
      responses.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.profile) {
          nextProfiles[result.value.authorId] = result.value.profile
        }
      })
      missingAuthorIds.forEach((authorId) => loadingProfileIdsRef.current.delete(authorId))

      if (Object.keys(nextProfiles).length > 0) {
        setProfileMap((current) => ({ ...current, ...nextProfiles }))
      }
    }

    fetchAuthorProfiles().catch((err) => {
      console.warn('Không thể tải tên người đăng báo cáo:', err?.message || err)
    })

    return () => {
      isCancelled = true
    }
  }, [missingAuthorIds])

  useEffect(() => () => {
    localImagesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
  }, [])

  const resetComposer = useCallback(() => {
    localImages.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setLocalImages([])
    setForm({ title: '', content: '', category: 'other', severity: 'medium', address: '', lat: '', lng: '', imagesText: '' })
    setShowComposer(false)
    setShowLocationPicker(false)
  }, [localImages])

  const handleImageFiles = (fileList) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    setError('')
    setLocalImages((current) => {
      const availableSlots = Math.max(0, MAX_POST_IMAGES - current.length)
      const accepted = []
      const rejected = []

      files.slice(0, availableSlots).forEach((file) => {
        if (!file.type?.startsWith('image/')) {
          rejected.push(`${file.name}: không phải ảnh`)
          return
        }
        if (file.size > MAX_POST_IMAGE_SIZE) {
          rejected.push(`${file.name}: vượt quá 8MB`)
          return
        }
        accepted.push(createLocalImageItem(file))
      })

      if (files.length > availableSlots) {
        rejected.push(`Chỉ hỗ trợ tối đa ${MAX_POST_IMAGES} ảnh mỗi báo cáo`)
      }
      if (rejected.length > 0) {
        setError(rejected.join('. '))
      }

      return [...current, ...accepted]
    })
  }

  const removeLocalImage = (imageId) => {
    setLocalImages((current) => {
      const removed = current.find((item) => item.id === imageId)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return current.filter((item) => item.id !== imageId)
    })
  }

  const feedStats = useMemo(() => {
    const pending = posts.filter((post) => post.status === 'pending').length
    const inProgress = posts.filter((post) => post.status === 'in_progress').length
    const resolved = posts.filter((post) => post.status === 'resolved').length
    return { pending, inProgress, resolved, total: posts.length }
  }, [posts])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await postService.listPosts({
        category: filters.category || undefined,
        status: filters.status || undefined,
        province: feedRegion.province || undefined,
        district: feedRegion.district || undefined,
        fallbackProvince: DEFAULT_FEED_PROVINCE,
      })
      setPosts(sortPostsForFeed(response?.data?.posts || [], feedRegion))
    } catch (err) {
      setError(err?.response?.data?.error || 'Không thể tải bảng tin')
    } finally {
      setLoading(false)
    }
  }, [feedRegion, filters])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  useEffect(() => {
    const socket = getSocket() || initSocket()
    if (!socket) return undefined
    const upsertPost = (payload) => {
      const post = payload?.post
      if (!post?.postId) return
      setPosts((current) => {
        const next = [post, ...current.filter((item) => item.postId !== post.postId)]
        const filtered = next.filter((item) => matchesFeedFilters(item, filters))
        return sortPostsForFeed(filtered, feedRegion)
      })
    }
    const upsertComment = (payload) => {
      const postId = String(payload?.postId || '')
      const comment = payload?.comment
      if (!postId || !comment?.commentId) return
      if (!expandedComments[postId] && !commentsByPost[postId]) return
      setCommentsByPost((current) => ({
        ...current,
        [postId]: upsertCommentInCollection(current[postId] || [], comment),
      }))
    }
    const updateCommentReaction = (payload) => {
      const postId = String(payload?.postId || '')
      const comment = payload?.comment
      if (!postId || !comment?.commentId) return
      if (!expandedComments[postId] && !commentsByPost[postId]) return
      setCommentsByPost((current) => ({
        ...current,
        [postId]: upsertCommentInCollection(current[postId] || [], comment),
      }))
    }
    socket.on('post:created', upsertPost)
    socket.on('post:updated', upsertPost)
    socket.on('post:status_changed', upsertPost)
    socket.on('post:reaction_updated', upsertPost)
    socket.on('post:comment_created', upsertPost)
    socket.on('post:comment_created', upsertComment)
    socket.on('post:comment_reaction_updated', updateCommentReaction)
    return () => {
      socket.off('post:created', upsertPost)
      socket.off('post:updated', upsertPost)
      socket.off('post:status_changed', upsertPost)
      socket.off('post:reaction_updated', upsertPost)
      socket.off('post:comment_created', upsertPost)
      socket.off('post:comment_created', upsertComment)
      socket.off('post:comment_reaction_updated', updateCommentReaction)
    }
  }, [commentsByPost, expandedComments, feedRegion, filters])

  const createPost = async (event) => {
    event.preventDefault()
    setError('')
    setUploadingImages(true)
    try {
      const urlImages = parseImageUrls(form.imagesText)
      if (localImages.length + urlImages.length > MAX_POST_IMAGES) {
        throw new Error(`Chỉ hỗ trợ tối đa ${MAX_POST_IMAGES} ảnh mỗi báo cáo`)
      }
      const uploadedImages = await Promise.all(localImages.map((item) => uploadPostImageFile(item.file)))
      const images = [...uploadedImages, ...urlImages]
      const content = [form.title, form.content].map((item) => item.trim()).filter(Boolean).join('\n\n')
      await postService.createPost({
        content,
        category: form.category,
        images,
        location: {
          address: form.address,
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          fallbackProvince: feedRegion.province || DEFAULT_FEED_PROVINCE,
          fallbackDistrict: feedRegion.district || undefined,
        },
      })
      resetComposer()
      await loadPosts()
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Không thể tạo bài đăng')
    } finally {
      setUploadingImages(false)
    }
  }

  const reactToPost = async (post, reactionType, isActive) => {
    const postId = post?.postId
    if (!postId) return
    const response = isActive
      ? await postService.removeReaction(postId, reactionType)
      : await postService.addReaction(postId, reactionType)
    const updatedPost = response?.data?.post
    if (updatedPost) {
      setPosts((current) => current.map((item) => item.postId === updatedPost.postId ? updatedPost : item))
    }
  }

  const loadCommentsForPost = useCallback(async (postId) => {
    if (!postId) return
    setLoadingCommentsByPost((current) => ({ ...current, [postId]: true }))
    try {
      const response = await postService.listComments(postId)
      setCommentsByPost((current) => ({ ...current, [postId]: response?.data?.comments || [] }))
    } catch (_) {
      setCommentsByPost((current) => ({ ...current, [postId]: [] }))
    } finally {
      setLoadingCommentsByPost((current) => ({ ...current, [postId]: false }))
    }
  }, [])

  const toggleInlineComments = useCallback(async (postId) => {
    const nextExpanded = !expandedComments[postId]
    setExpandedComments((current) => ({ ...current, [postId]: nextExpanded }))
    if (nextExpanded && !commentsByPost[postId]) {
      await loadCommentsForPost(postId)
    }
  }, [commentsByPost, expandedComments, loadCommentsForPost])

  const submitInlineComment = async (postId) => {
    const draft = String(commentDraftByPost[postId] || '').trim()
    if (!draft) return
    const response = await postService.createComment(postId, { content: draft })
    const nextComment = response?.data?.comment
    if (nextComment) {
      setCommentsByPost((current) => ({
        ...current,
        [postId]: upsertCommentInCollection(current[postId] || [], nextComment),
      }))
      setCommentDraftByPost((current) => ({ ...current, [postId]: '' }))
    }
    const nextPost = response?.data?.post
    if (nextPost) {
      setPosts((current) => current.map((item) => item.postId === nextPost.postId ? nextPost : item))
    }
  }

  const submitReplyForPost = async (postId, parentComment) => {
    const draft = String(replyDraftByPost[postId] || '').trim()
    if (!draft || !parentComment?.commentId) return
    const response = await postService.createComment(postId, {
      content: draft,
      parentCommentId: parentComment.commentId,
    })
    const nextComment = response?.data?.comment
    if (nextComment) {
      setCommentsByPost((current) => ({
        ...current,
        [postId]: upsertCommentInCollection(current[postId] || [], nextComment),
      }))
      setReplyDraftByPost((current) => ({ ...current, [postId]: '' }))
      setReplyingToByPost((current) => ({ ...current, [postId]: '' }))
    }
    const nextPost = response?.data?.post
    if (nextPost) {
      setPosts((current) => current.map((item) => item.postId === nextPost.postId ? nextPost : item))
    }
  }

  const reactToCommentForPost = async (postId, targetComment, reactionType, isActive) => {
    if (!targetComment?.commentId) return
    const response = isActive
      ? await postService.removeCommentReaction(postId, targetComment.commentId, reactionType)
      : await postService.addCommentReaction(postId, targetComment.commentId, reactionType)
    const updatedComment = response?.data?.comment
    if (updatedComment) {
      setCommentsByPost((current) => ({
        ...current,
        [postId]: upsertCommentInCollection(current[postId] || [], updatedComment),
      }))
    }
  }

  return (
    <UrbanShell>
      <div className="urban-social-layout">
        <section className="urban-feed-column">
          <header className="urban-feed-top">
            <div>
              <h1>Bảng tin đô thị</h1>
              <p>
                Ưu tiên bài trong {feedRegion.district ? `${feedRegion.district}, ` : ''}{feedRegion.province || DEFAULT_FEED_PROVINCE}.
              </p>
            </div>
            <button type="button" className="urban-icon-button" onClick={loadPosts} title="Làm mới">
              <FiRefreshCcw />
            </button>
          </header>

          <section className="urban-composer">
            <div className="urban-avatar urban-avatar-soft">T</div>
            <button type="button" className="urban-composer-trigger" onClick={() => setShowComposer(true)}>
              {feedRegion.district ? `${feedRegion.district} đang có sự cố gì?` : 'Khu vực của bạn đang có sự cố gì?'}
            </button>
          </section>

          {showComposer ? (
            <form className="urban-create" onSubmit={createPost}>
              <div className="urban-create-title">
                <h2><FiPlus /> Tạo báo cáo</h2>
                <button
                  type="button"
                  className="urban-ghost-button"
                  onClick={() => {
                    resetComposer()
                  }}
                >
                  Đóng
                </button>
              </div>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tiêu đề sự cố" required />
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Mô tả sự cố..." required />
              <div className="urban-grid">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {severities.map(([key, label]) => <option key={key} value={key}>Mức độ: {label}</option>)}
                </select>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={getLocationInputPlaceholder()} />
                <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="Vĩ độ" inputMode="decimal" />
                <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="Kinh độ" inputMode="decimal" />
              </div>
              <div className="urban-location-tools">
                <div>
                  <strong>Vị trí báo cáo</strong>
                  <span>
                    {form.lat && form.lng ? `Đã chọn: ${form.lat}, ${form.lng}` : 'Chọn nhanh bằng bản đồ hoặc nhập địa chỉ theo chuẩn.'}
                  </span>
                </div>
                <button type="button" onClick={() => setShowLocationPicker((current) => !current)}>
                  <FiMap /> {showLocationPicker ? 'Ẩn bản đồ' : 'Chọn trên bản đồ'}
                </button>
              </div>
              {showLocationPicker ? (
                <LocationMapPicker lat={form.lat} lng={form.lng} onPick={applyPickedLocation} />
              ) : null}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="urban-hidden-file-input"
                onChange={(event) => {
                  handleImageFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="urban-hidden-file-input"
                onChange={(event) => {
                  handleImageFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              <div className="urban-image-tools">
                <div>
                  <strong>Ảnh hiện trường</strong>
                  <span>Tải ảnh từ thiết bị, chụp trực tiếp hoặc dán URL ảnh.</span>
                </div>
                <div className="urban-image-tool-actions">
                  <button type="button" onClick={() => imageInputRef.current?.click()} disabled={localImages.length >= MAX_POST_IMAGES}>
                    <FiImage /> Tải ảnh
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={localImages.length >= MAX_POST_IMAGES}>
                    <FiCamera /> Chụp ảnh
                  </button>
                </div>
              </div>
              <textarea value={form.imagesText} onChange={(e) => setForm({ ...form, imagesText: e.target.value })} placeholder="Hoặc URL ảnh, mỗi dòng một ảnh" />
              <div className="urban-create-preview" aria-live="polite">
                {localImages.length > 0 || imagePreviewUrls.length > 0 ? (
                  <>
                    {localImages.map((item, index) => (
                      <div className="urban-create-preview-item" key={item.id}>
                        <img src={item.previewUrl} alt={`Ảnh tải lên ${index + 1}`} />
                        <button type="button" onClick={() => removeLocalImage(item.id)} aria-label="Xóa ảnh">
                          <FiX />
                        </button>
                      </div>
                    ))}
                    {imagePreviewUrls.slice(0, Math.max(0, MAX_POST_IMAGES - localImages.length)).map((url, index) => (
                      <div className="urban-create-preview-item" key={`${url}-${index}`}>
                        <img src={url} alt={`Xem trước ảnh URL ${index + 1}`} loading="lazy" />
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="urban-create-preview-empty">
                    <FiCamera />
                    <span>Ảnh hiện trường sẽ hiển thị trong bài báo cáo</span>
                  </div>
                )}
              </div>
              <div className="urban-create-actions">
                <span><FiCamera /> {localImages.length + imagePreviewUrls.length}/{MAX_POST_IMAGES} ảnh</span>
                <span><FiMapPin /> Vị trí</span>
                <span>Mức độ: {severityLabel(form.severity)}</span>
                <button type="submit" disabled={uploadingImages}>
                  <FiSend /> {uploadingImages ? 'Đang tải ảnh...' : 'Đăng sự cố'}
                </button>
              </div>
            </form>
          ) : null}

          {error ? <p className="urban-error">{error}</p> : null}
          {loading ? <p className="urban-muted">Đang tải bảng tin...</p> : null}
          <div className="urban-feed">
            {posts.map((post) => (
              <PostCard
                key={post.postId}
                post={post}
                onReact={reactToPost}
                currentUser={currentUser}
                currentUserId={currentUserId}
                profileMap={profileMap}
                isCommentsExpanded={Boolean(expandedComments[post.postId])}
                comments={commentsByPost[post.postId] || []}
                commentDraft={commentDraftByPost[post.postId] || ''}
                replyDraft={replyDraftByPost[post.postId] || ''}
                replyingTo={replyingToByPost[post.postId] || ''}
                loadingComments={Boolean(loadingCommentsByPost[post.postId])}
                onToggleComments={toggleInlineComments}
                onCommentDraftChange={(postId, value) => setCommentDraftByPost((current) => ({ ...current, [postId]: value }))}
                onSubmitComment={submitInlineComment}
                onStartReply={(item) => setReplyingToByPost((current) => ({ ...current, [post.postId]: item.commentId }))}
                onCancelReply={() => {
                  setReplyingToByPost((current) => ({ ...current, [post.postId]: '' }))
                  setReplyDraftByPost((current) => ({ ...current, [post.postId]: '' }))
                }}
                onReplyDraftChange={(value) => setReplyDraftByPost((current) => ({ ...current, [post.postId]: value }))}
                onSubmitReply={(event, item) => {
                  event.preventDefault()
                  submitReplyForPost(post.postId, item)
                }}
                onCommentReact={(item, reactionType, isActive) => reactToCommentForPost(post.postId, item, reactionType, isActive)}
              />
            ))}
            {!loading && posts.length === 0 ? <p className="urban-empty">Chưa có báo cáo phù hợp.</p> : null}
          </div>
        </section>

        <aside className="urban-right-rail">
          <section className="urban-side-card">
            <h2><FiFilter /> Bộ lọc</h2>
            <div className="urban-filters">
              <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
                <option value="">Tất cả hạng mục</option>
                {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">Tất cả trạng thái</option>
                {statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
          </section>

          <section className="urban-side-card">
            <h2><FiAlertTriangle /> Tình hình</h2>
            <div className="urban-stat-list">
              <span><strong>{feedStats.total}</strong> báo cáo</span>
              <span><strong>{feedStats.pending}</strong> chờ xử lý</span>
              <span><strong>{feedStats.inProgress}</strong> đang xử lý</span>
              <span><strong>{feedStats.resolved}</strong> đã xử lý</span>
            </div>
          </section>

          <section className="urban-side-card urban-shortcuts">
            <h2><FiUsers /> Lối tắt</h2>
            <Link to="/urban/map"><FiMap /> Bản đồ sự cố</Link>
            <Link to="/urban/assistant"><FiMessageCircle /> Trợ lý đô thị</Link>
            <button type="button" onClick={() => setShowComposer(true)}><FiPlus /> Báo cáo mới</button>
          </section>
        </aside>
      </div>
    </UrbanShell>
  )
}

const groupComments = (comments = []) => {
  const byId = new Map()
  const roots = []

  comments.forEach((item) => {
    if (item?.commentId) {
      byId.set(item.commentId, { ...item, replies: [] })
    }
  })

  comments.forEach((item) => {
    const node = byId.get(item?.commentId)
    if (!node) return
    const parent = item?.parentCommentId ? byId.get(item.parentCommentId) : null
    if (parent) {
      parent.replies.unshift(node)
      return
    }
    roots.push(node)
  })

  return roots
}

const CommentItem = ({
  item,
  replies = [],
  profileMap,
  currentUser,
  currentUserId,
  replyingTo,
  replyText,
  onStartReply,
  onCancelReply,
  onReplyTextChange,
  onSubmitReply,
  onReact,
}) => {
  const isReplying = replyingTo === item.commentId

  return (
    <div className="urban-comment">
      <div className="urban-avatar urban-comment-avatar">
        {getAuthorAvatar(item, profileMap, currentUser) ? (
          <img src={getAuthorAvatar(item, profileMap, currentUser)} alt={getAuthorLabel(item, profileMap, currentUser)} loading="lazy" />
        ) : (
          getInitial(item, profileMap, currentUser)
        )}
      </div>
      <div className="urban-comment-main">
        <div className="urban-comment-bubble">
          <div className="urban-comment-head">
            <strong>{getAuthorLabel(item, profileMap, currentUser)}</strong>
            <small>{new Date(item.createdAt).toLocaleString('vi-VN')}</small>
          </div>
          <p>{item.content}</p>
        </div>
        <div className="urban-comment-actions">
          <button
            type="button"
            className={hasReacted(item, 'heart', currentUserId) ? 'active' : ''}
            aria-pressed={hasReacted(item, 'heart', currentUserId)}
            aria-label="Thích bình luận"
            title="Thích"
            onClick={() => onReact(item, 'heart', hasReacted(item, 'heart', currentUserId))}
          >
            <FiThumbsUp />
            {getReactionCount(item, 'heart') ? <span>{getReactionCount(item, 'heart')}</span> : null}
          </button>
          <button type="button" aria-label="Trả lời bình luận" title="Trả lời" onClick={() => onStartReply(item)}>
            <FiCornerUpLeft />
          </button>
        </div>
        {isReplying ? (
          <form className="urban-reply-form" onSubmit={(event) => onSubmitReply(event, item)}>
            <input
              value={replyText}
              onChange={(event) => onReplyTextChange(event.target.value)}
              placeholder={`Trả lời ${getAuthorLabel(item, profileMap, currentUser)}...`}
              autoFocus
            />
            <button type="submit"><FiSend /> Gửi</button>
            <button type="button" className="urban-reply-cancel" onClick={onCancelReply}>Hủy</button>
          </form>
        ) : null}
        {replies.length > 0 ? (
          <div className="urban-comment-replies">
            {replies.map((reply) => (
              <CommentItem
                key={reply.commentId}
                item={reply}
                replies={reply.replies}
                profileMap={profileMap}
                currentUser={currentUser}
                currentUserId={currentUserId}
                replyingTo={replyingTo}
                replyText={replyText}
                onStartReply={onStartReply}
                onCancelReply={onCancelReply}
                onReplyTextChange={onReplyTextChange}
                onSubmitReply={onSubmitReply}
                onReact={onReact}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const UrbanPostDetailPage = () => {
  const { postId } = useParams()
  const currentUser = useAuthStore((state) => state.user)
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const [replyingTo, setReplyingTo] = useState('')
  const [replyText, setReplyText] = useState('')
  const [profileMap, setProfileMap] = useState({})
  const [error, setError] = useState('')
  const currentUserId = useMemo(() => getCurrentUserId(currentUser), [currentUser])
  const loadingProfileIdsRef = useRef(new Set())
  const commentThreads = useMemo(() => groupComments(comments), [comments])
  const missingProfileIds = useMemo(() => {
    const ids = new Set()
    ;[post, ...comments].forEach((item) => {
      const authorId = getAuthorId(item)
      if (!authorId || authorId === currentUserId || profileMap[authorId] || loadingProfileIdsRef.current.has(authorId)) {
        return
      }
      ids.add(authorId)
    })
    return Array.from(ids)
  }, [comments, currentUserId, post, profileMap])

  const loadDetail = useCallback(async () => {
    try {
      const [postRes, commentsRes] = await Promise.all([
        postService.getPost(postId),
        postService.listComments(postId),
      ])
      setPost(postRes?.data?.post || null)
      setComments(commentsRes?.data?.comments || [])
    } catch (err) {
      setError(err?.response?.data?.error || 'Không thể tải chi tiết')
    }
  }, [postId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useEffect(() => {
    const socket = getSocket() || initSocket()
    if (!socket) return undefined

    const handlePostUpdate = (payload) => {
      const nextPost = payload?.post
      if (!nextPost?.postId || nextPost.postId !== postId) return
      setPost(nextPost)
    }
    const handleCommentCreated = (payload) => {
      if (String(payload?.postId || '') !== String(postId)) return
      if (!payload?.comment?.commentId) return
      setComments((current) => upsertCommentInCollection(current, payload.comment))
      if (payload?.post) setPost(payload.post)
    }
    const handleCommentReactionUpdated = (payload) => {
      if (String(payload?.postId || '') !== String(postId)) return
      if (!payload?.comment?.commentId) return
      setComments((current) => upsertCommentInCollection(current, payload.comment))
    }

    socket.on('post:updated', handlePostUpdate)
    socket.on('post:status_changed', handlePostUpdate)
    socket.on('post:reaction_updated', handlePostUpdate)
    socket.on('post:comment_created', handleCommentCreated)
    socket.on('post:comment_reaction_updated', handleCommentReactionUpdated)

    return () => {
      socket.off('post:updated', handlePostUpdate)
      socket.off('post:status_changed', handlePostUpdate)
      socket.off('post:reaction_updated', handlePostUpdate)
      socket.off('post:comment_created', handleCommentCreated)
      socket.off('post:comment_reaction_updated', handleCommentReactionUpdated)
    }
  }, [postId])

  useEffect(() => {
    let isCancelled = false

    const fetchProfiles = async () => {
      if (missingProfileIds.length === 0) return
      missingProfileIds.forEach((authorId) => loadingProfileIdsRef.current.add(authorId))
      const responses = await Promise.allSettled(
        missingProfileIds.map(async (authorId) => {
          const response = await userService.getProfile(authorId)
          return { authorId, profile: response?.data?.user || null }
        })
      )
      if (isCancelled) return

      const nextProfiles = {}
      responses.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.profile) {
          nextProfiles[result.value.authorId] = result.value.profile
        }
      })
      missingProfileIds.forEach((authorId) => loadingProfileIdsRef.current.delete(authorId))
      if (Object.keys(nextProfiles).length > 0) {
        setProfileMap((current) => ({ ...current, ...nextProfiles }))
      }
    }

    fetchProfiles().catch((err) => {
      console.warn('Không thể tải tên người dùng trong bình luận:', err?.message || err)
    })

    return () => {
      isCancelled = true
    }
  }, [missingProfileIds])

  const updateStatus = async (status) => {
    const response = await postService.updateStatus(postId, status)
    setPost(response?.data?.post || post)
  }

  const submitComment = async (event) => {
    event.preventDefault()
    if (!comment.trim()) return
    const response = await postService.createComment(postId, { content: comment })
    setComment('')
    setPost(response?.data?.post || post)
    setComments((current) => [response?.data?.comment, ...current].filter(Boolean))
  }

  const submitReply = async (event, parentComment) => {
    event.preventDefault()
    if (!replyText.trim() || !parentComment?.commentId) return
    const response = await postService.createComment(postId, {
      content: replyText,
      parentCommentId: parentComment.commentId,
    })
    setReplyText('')
    setReplyingTo('')
    setPost(response?.data?.post || post)
    setComments((current) => [response?.data?.comment, ...current].filter(Boolean))
  }

  const reactToComment = async (targetComment, reactionType, isActive) => {
    if (!targetComment?.commentId) return
    const response = isActive
      ? await postService.removeCommentReaction(postId, targetComment.commentId, reactionType)
      : await postService.addCommentReaction(postId, targetComment.commentId, reactionType)
    const updatedComment = response?.data?.comment
    if (updatedComment) {
      setComments((current) => current.map((item) => (
        item.commentId === updatedComment.commentId ? updatedComment : item
      )))
    }
  }

  const coordinates = getPostCoordinates(post)

  return (
    <UrbanShell>
      {error ? <p className="urban-error">{error}</p> : null}
      {!post ? <p className="urban-muted">Đang tải...</p> : (
        <article className="urban-detail">
          <div className="urban-post-head">
            <span className={`urban-pill category-${post.category}`}>{categoryLabel(post.category)}</span>
            <span className={`urban-status status-${post.status}`}>{statusLabel(post.status)}</span>
          </div>
          <div className="urban-detail-author">
            <div className="urban-avatar">
              {getAuthorAvatar(post, profileMap, currentUser) ? (
                <img src={getAuthorAvatar(post, profileMap, currentUser)} alt={getAuthorLabel(post, profileMap, currentUser)} loading="lazy" />
              ) : (
                getInitial(post, profileMap, currentUser)
              )}
            </div>
            <div>
              <strong>{getAuthorLabel(post, profileMap, currentUser)}</strong>
              <span>{formatPostTime(post.createdAt)} · {categoryLabel(post.category)}</span>
            </div>
          </div>
          {getPostImages(post).length > 0 ? (
            <div className={`urban-images urban-detail-images image-count-${Math.min(getPostImages(post).length, 3)}`}>
              {getPostImages(post).slice(0, 3).map((url, index) => (
                <div key={`${url}-${index}`} className="urban-image-frame">
                  <img src={url} alt={`Ảnh chi tiết báo cáo ${index + 1}`} loading="lazy" />
                </div>
              ))}
            </div>
          ) : (
            <div className="urban-detail-placeholder">
              <FiCamera />
              <span>Chưa có ảnh hiện trường cho báo cáo này</span>
            </div>
          )}
          <p>{post.content}</p>
          {coordinates ? (
            <Link className={`urban-detail-map-link status-${post.status}`} to={getPostMapHref(post)}>
              <FiMapPin />
              <span>{formatLocationLabel(post.location) || `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`}</span>
              <strong>Xem vị trí trên bản đồ</strong>
            </Link>
          ) : formatLocationLabel(post.location) ? (
            <p className="urban-location"><FiMapPin /> {formatLocationLabel(post.location)}</p>
          ) : null}
          <div className="urban-status-actions">
            {statuses.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={post.status === key ? `active status-${key}` : ''}
                onClick={() => updateStatus(key)}
                disabled={post.status === key}
              >
                <FiCheckCircle /> {label}
              </button>
            ))}
          </div>
        </article>
      )}

      <section className="urban-comments">
        <h2>Bình luận</h2>
        <form onSubmit={submitComment}>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Nhập bình luận..." />
          <button type="submit"><FiSend /> Gửi</button>
        </form>
        {commentThreads.map((item) => (
          <CommentItem
            key={item.commentId}
            item={item}
            replies={item.replies}
            profileMap={profileMap}
            currentUser={currentUser}
            currentUserId={currentUserId}
            replyingTo={replyingTo}
            replyText={replyText}
            onStartReply={(nextComment) => {
              setReplyingTo(nextComment.commentId)
              setReplyText('')
            }}
            onCancelReply={() => {
              setReplyingTo('')
              setReplyText('')
            }}
            onReplyTextChange={setReplyText}
            onSubmitReply={submitReply}
            onReact={reactToComment}
          />
        ))}
        {!comments.length ? <p className="urban-muted">Chưa có bình luận nào.</p> : null}
      </section>
    </UrbanShell>
  )
}

export const UrbanMapPage = () => {
  const [searchParams] = useSearchParams()
  const [posts, setPosts] = useState([])
  const [error, setError] = useState('')
  const [mapStatus, setMapStatus] = useState('loading')
  const [loadingPosts, setLoadingPosts] = useState(false)
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const lastBoundsRequestRef = useRef('')
  const selectedPopupOpenedRef = useRef('')
  const selectedPostId = searchParams.get('postId') || ''
  const selectedLat = toCoordinateNumber(searchParams.get('lat'))
  const selectedLng = toCoordinateNumber(searchParams.get('lng'))
  const selectedCenter = useMemo(
    () => selectedLat !== null && selectedLng !== null ? [selectedLng, selectedLat] : null,
    [selectedLat, selectedLng]
  )

  const loadPostsInBounds = useCallback(async (options = {}) => {
    const map = mapRef.current
    if (!map) return

    const bounds = map.getBounds()
    const boundsKey = [
      bounds.getNorth(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getWest(),
    ].map((value) => Number(value).toFixed(5)).join('|')
    const force = options?.force === true
    if (!force && lastBoundsRequestRef.current === boundsKey) {
      return
    }
    lastBoundsRequestRef.current = boundsKey

    setError('')
    setLoadingPosts(true)
    try {
      const response = await postService.inBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        limit: 100,
      })
      setPosts(response?.data?.posts || [])
    } catch (err) {
      setError(err?.response?.data?.error || 'Không thể tải sự cố trong vùng bản đồ')
    } finally {
      setLoadingPosts(false)
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined

    let disposed = false
    const initializeMap = async () => {
      setMapStatus('loading')
      setError('')

      try {
        const styleResponse = await apiClient.get('/maps/style')
        if (disposed) return

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: styleResponse.data,
          center: selectedCenter || [106.7019, 10.7758],
          zoom: selectedCenter ? 15 : 12,
          pitch: 20,
          attributionControl: true,
          transformRequest: (url) => {
            if (url.startsWith(`${API_URL}/maps`) || url.includes('/api/maps/')) {
              const token = useAuthStore.getState()?.accessToken
              return {
                url,
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              }
            }
            return { url }
          },
        })

        map.on('load', () => {
          setMapStatus('ready')
          loadPostsInBounds({ force: true })
        })
        map.on('moveend', loadPostsInBounds)
        map.on('error', (event) => {
          if (isIgnorableMapTileError(event)) return
          const message = event?.error?.message || 'Không thể tải bản đồ AWS Location'
          setError(message)
          setMapStatus('error')
        })

        mapRef.current = map
      } catch (err) {
        if (disposed) return
        setMapStatus('error')
        setError(err?.response?.data?.error || 'Không thể tải cấu hình AWS Location map từ backend')
      }
    }

    initializeMap()

    return () => {
      disposed = true
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [loadPostsInBounds, selectedCenter])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStatus !== 'ready' || !selectedPostId) return

    let isCancelled = false
    const focusSelectedPost = async () => {
      try {
        const response = await postService.getPost(selectedPostId)
        if (isCancelled) return
        const selectedPost = response?.data?.post
        const coordinates = getPostCoordinates(selectedPost)
        if (!selectedPost || !coordinates) return

        setPosts((current) => {
          if (current.some((post) => post.postId === selectedPost.postId)) {
            return current.map((post) => post.postId === selectedPost.postId ? selectedPost : post)
          }
          return [selectedPost, ...current]
        })

        map.flyTo({
          center: [coordinates.lng, coordinates.lat],
          zoom: 16,
          pitch: 20,
          essential: true,
        })
      } catch (err) {
        setError(err?.response?.data?.error || 'Không thể tải vị trí sự cố đã chọn')
      }
    }

    focusSelectedPost()

    return () => {
      isCancelled = true
    }
  }, [selectedPostId, mapStatus])

  useEffect(() => {
    selectedPopupOpenedRef.current = ''
  }, [selectedPostId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    posts.forEach((post) => {
      const lat = Number(post?.location?.lat)
      const lng = Number(post?.location?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      const isSelected = selectedPostId && post.postId === selectedPostId
      const markerEl = document.createElement('button')
      const markerIconEl = document.createElement('span')
      const markerStatusEl = document.createElement('span')
      markerEl.type = 'button'
      markerEl.className = `urban-map-pin${isSelected ? ' selected' : ''}`
      markerEl.dataset.status = String(post.status || 'pending')
      markerEl.dataset.category = String(post.category || 'other')
      markerEl.style.setProperty('--urban-marker-color', categoryMarkerColors[post.category] || categoryMarkerColors.other)
      markerEl.style.setProperty('--urban-marker-status-color', statusMarkerColors[post.status] || statusMarkerColors.pending)
      markerEl.title = categoryLabel(post.category)
      markerEl.setAttribute('aria-label', `${categoryLabel(post.category)} - ${statusLabel(post.status)}`)
      markerIconEl.className = 'urban-map-pin-icon'
      markerIconEl.setAttribute('aria-hidden', 'true')
      markerIconEl.innerHTML = renderCategoryMarkerIcon(post.category, 'urban-map-pin-icon-svg')
      markerStatusEl.className = 'urban-map-pin-status'
      markerStatusEl.setAttribute('aria-hidden', 'true')
      markerEl.appendChild(markerIconEl)
      markerEl.appendChild(markerStatusEl)

      const popup = new maplibregl.Popup({ offset: 22, closeButton: true })
        .setDOMContent(createPostPopupNode(post))

      const marker = new maplibregl.Marker({ element: markerEl, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)

      if (isSelected && selectedPopupOpenedRef.current !== selectedPostId) {
        selectedPopupOpenedRef.current = selectedPostId
        window.setTimeout(() => {
          marker.togglePopup()
        }, 0)
      }
    })
  }, [posts, selectedPostId])

  const resetToHoChiMinh = () => {
    mapRef.current?.flyTo({
      center: [106.7019, 10.7758],
      zoom: 12,
      pitch: 20,
      essential: true,
    })
  }

  const zoomIn = () => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: Math.min(map.getZoom() + 1, 20), duration: 250 })
  }

  const zoomOut = () => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: Math.max(map.getZoom() - 1, 2), duration: 250 })
  }

  const locateUser = () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ lấy vị trí hiện tại')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const map = mapRef.current
        if (!map) return
        setError('')
        map.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: Math.max(map.getZoom(), 15),
          essential: true,
        })
      },
      () => setError('Không thể lấy vị trí hiện tại. Hãy cấp quyền vị trí và thử lại.')
    )
  }

  return (
    <UrbanShell mainClassName="urban-main-map" navClassName="urban-top-nav-floating">
      <div className="urban-map-page">
        <header className="urban-map-page-head">
          <h1>Bản đồ sự cố</h1>
        </header>
        <section className="urban-map-shell urban-map-shell-immersive">
          <div ref={mapContainerRef} className="urban-map-canvas" />

          <div className="urban-map-toolbar" aria-label="Điều khiển bản đồ">
            <button type="button" onClick={zoomIn} title="Phóng to" aria-label="Phóng to">
              <FiPlus />
            </button>
            <button type="button" onClick={zoomOut} title="Thu nhỏ" aria-label="Thu nhỏ">
              <FiMinus />
            </button>
            <button type="button" onClick={locateUser} title="Vị trí hiện tại" aria-label="Vị trí hiện tại">
              <FiCrosshair />
            </button>
            <button type="button" onClick={resetToHoChiMinh} title="Về TP.HCM" aria-label="Về TP.HCM">
              <FiMapPin />
            </button>
            <button type="button" onClick={() => loadPostsInBounds({ force: true })} title="Tải lại" aria-label="Tải lại">
              <FiRefreshCcw />
            </button>
          </div>

          {mapStatus === 'loading' ? (
            <div className="urban-map-overlay">
              <strong>Đang tải bản đồ AWS Location...</strong>
              <span>Backend sẽ proxy style, tile, sprite và glyph cho MapLibre.</span>
            </div>
          ) : null}

          {error ? (
            <div className="urban-map-error">
              <strong>Không thể tải bản đồ</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <aside className="urban-map-panel">
            <div>
              <strong>{posts.length}</strong>
              <span>sự cố trong vùng xem</span>
            </div>
            <div>
              <strong>{posts.filter((post) => post.status === 'pending').length}</strong>
              <span>chờ xử lý</span>
            </div>
            <div>
              <strong>{posts.filter((post) => post.status === 'in_progress').length}</strong>
              <span>đang xử lý</span>
            </div>
            <div>
              <strong>{posts.filter((post) => post.status === 'resolved').length}</strong>
              <span>đã xử lý</span>
            </div>
            {loadingPosts ? <p>Đang cập nhật marker...</p> : null}
            {!loadingPosts && posts.length === 0 && mapStatus === 'ready' ? (
              <p>Không có sự cố nào trong vùng bản đồ hiện tại.</p>
            ) : null}
          </aside>
        </section>

        <div className="urban-map-legend">
          {categories.map(([key, label]) => (
            <span key={key}>
              {React.createElement(getCategoryMarkerIcon(key), { className: 'urban-map-legend-icon', 'aria-hidden': true })}
              {label}
            </span>
          ))}
        </div>
      </div>
    </UrbanShell>
  )
}

export const UrbanAssistantPage = () => <AssistantPage />
