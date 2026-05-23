import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import useAuthStore from '../store/authStore'
import apiClient, { API_URL, userService } from '../services/api'
import { useDialog } from '../context/DialogContext'
import {
  extractLocationFromReverseGeocode as extractFormattedLocationFromReverseGeocode,
  formatLocationLabel,
  normalizeProfileLocation as normalizeFormattedProfileLocation,
} from '../utils/addressFormat.js'
import '../styles/ProfilePage.css'

const DEFAULT_PROFILE_LOCATION = { lat: 10.776889, lng: 106.700806 }

const toCoordinateNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const formatCoordinates = (location = {}) => {
  const lat = toCoordinateNumber(location.lat)
  const lng = toCoordinateNumber(location.lng)
  if (lat === null || lng === null) return ''
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

const getLocationLabel = (location = {}) => {
  const district = String(location?.district || '').trim()
  const province = String(location?.province || '').trim()
  const address = String(location?.address || '').trim()
  const regionLabel = [district, province].filter(Boolean).join(', ')
  return regionLabel || address || 'Chưa chọn khu vực'
}

const normalizeProfileLocation = (location = {}, fallbackUser = {}) => {
  const province = String(location?.province || fallbackUser?.province || '').trim()
  const district = String(location?.district || fallbackUser?.district || '').trim()
  const address = String(
    location?.address ||
    [district, province].filter(Boolean).join(', ')
  ).trim()
  return {
    address,
    lat: location?.lat ?? '',
    lng: location?.lng ?? '',
    province,
    district,
  }
}

const extractLocationFromReverseGeocode = (data = {}, coordinates = {}) => {
  const address = data?.address || {}
  const province = String(
    address.city ||
    address.state ||
    address.province ||
    address.region ||
    ''
  ).trim()
  const district = String(
    address.city_district ||
    address.district ||
    address.county ||
    address.suburb ||
    address.town ||
    ''
  ).trim()

  return {
    address: String(data?.display_name || '').trim(),
    lat: coordinates.lat,
    lng: coordinates.lng,
    province,
    district,
  }
}

const reverseGeocodeLocation = async ({ lat, lng }) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=vi`
  )
  if (!response.ok) throw new Error('Không thể lấy dữ liệu khu vực từ bản đồ')

  const data = await response.json()
  const location = extractFormattedLocationFromReverseGeocode(data, { lat, lng })
  return {
    ...location,
    address: location.address || `Vị trí đã chọn (${formatCoordinates(location)})`,
  }
}

const ProfileLocationPicker = ({ value, onChange, onClose }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [draftLocation, setDraftLocation] = useState(() => normalizeFormattedProfileLocation(value))
  const [resolving, setResolving] = useState(false)

  const placeMarker = useCallback((map, lng, lat) => {
    const coordinates = [lng, lat]
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: '#2563eb', draggable: true })
        .setLngLat(coordinates)
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const markerCoordinates = markerRef.current.getLngLat()
        pickCoordinates(markerCoordinates.lng, markerCoordinates.lat)
      })
      return
    }
    markerRef.current.setLngLat(coordinates)
  }, [])

  const pickCoordinates = useCallback(async (lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

    const nextCoordinates = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    }
    const map = mapRef.current
    if (map) {
      placeMarker(map, nextCoordinates.lng, nextCoordinates.lat)
      map.easeTo({
        center: [nextCoordinates.lng, nextCoordinates.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 450,
      })
    }

    setResolving(true)
    setError('')
    try {
      const resolvedLocation = await reverseGeocodeLocation(nextCoordinates)
      setDraftLocation(resolvedLocation)
    } catch (err) {
      setDraftLocation({
        address: `Vị trí đã chọn (${formatCoordinates(nextCoordinates)})`,
        province: '',
        district: '',
        ...nextCoordinates,
      })
      setError(err?.message || 'Không thể lấy khu vực từ vị trí đã chọn')
    } finally {
      setResolving(false)
    }
  }, [placeMarker])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    let disposed = false
    const currentLat = toCoordinateNumber(value?.lat)
    const currentLng = toCoordinateNumber(value?.lng)
    const center = currentLat !== null && currentLng !== null
      ? [currentLng, currentLat]
      : [DEFAULT_PROFILE_LOCATION.lng, DEFAULT_PROFILE_LOCATION.lat]

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
          setStatus('error')
          setError(event?.error?.message || 'Không thể tải bản đồ chọn khu vực')
        })

        mapRef.current = map
      } catch (err) {
        if (disposed) return
        setStatus('error')
        setError(err?.response?.data?.error || 'Không thể tải bản đồ chọn khu vực')
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
  }, [pickCoordinates, placeMarker, value?.lat, value?.lng])

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

  const canConfirm = Boolean(draftLocation?.address || draftLocation?.province || draftLocation?.district)

  return (
    <div className="profile-location-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="profile-location-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-location-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-location-modal-header">
          <div>
            <h2 id="profile-location-title">Chọn khu vực trên bản đồ</h2>
            <p>Click vào bản đồ hoặc dùng vị trí hiện tại để lấy tỉnh/quận tự động.</p>
          </div>
          <button type="button" className="profile-modal-close" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>

        <div className="profile-location-map-wrap">
          <div ref={containerRef} className="profile-location-map" />
          {status === 'loading' ? <div className="profile-location-map-overlay">Đang tải bản đồ...</div> : null}
        </div>

        <div className="profile-location-tools">
          <button type="button" className="btn btn-secondary" onClick={useCurrentLocation}>
            Dùng vị trí hiện tại
          </button>
          <div className="profile-location-preview">
            <strong>{formatLocationLabel(draftLocation)}</strong>
            <span>{resolving ? 'Đang nhận diện khu vực...' : (formatCoordinates(draftLocation) || 'Chưa có tọa độ')}</span>
          </div>
        </div>

        {error ? <p className="profile-location-error">{error}</p> : null}

        <div className="profile-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canConfirm || resolving}
            onClick={() => {
              onChange(normalizeFormattedProfileLocation(draftLocation))
              onClose()
            }}
          >
            {resolving ? 'Đang lấy khu vực...' : 'Xác nhận khu vực'}
          </button>
        </div>
      </section>
    </div>
  )
}

const ProfilePage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { notify, confirm } = useDialog()
  const { user, logout, updateUser } = useAuthStore()

  // Form states
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [profileLocation, setProfileLocation] = useState(() => normalizeFormattedProfileLocation())
  const [avatar, setAvatar] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })

  // UI states
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [profileErrors, setProfileErrors] = useState({})
  const displayNameRef = useRef(null)
  const bioRef = useRef(null)

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || user.fullName || user.username || '')
      setBio(user.bio || '')
      setProfileLocation(normalizeFormattedProfileLocation(user.location, user))
      setAvatar(user.avatar || '')
      setAvatarPreview(user.avatar || '')
    }
  }, [user])

  useEffect(() => {
    if (searchParams.get('openLocation') === '1') {
      setShowLocationPicker(true)
    }
  }, [searchParams])

  const closeLocationPicker = useCallback(() => {
    setShowLocationPicker(false)
    if (searchParams.get('openLocation') === '1') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('openLocation')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 4000)
  }

  // Handle avatar file selection
  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showMessage('error', 'Kích thước tệp không được vượt quá 5MB')
        return
      }

      if (!file.type.startsWith('image/')) {
        showMessage('error', 'Vui lòng chọn một tệp hình ảnh')
        return
      }

      setAvatarFile(file)

      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  // Upload avatar
  const handleUploadAvatar = async () => {
    if (!avatarFile) {
      showMessage('error', 'Vui lòng chọn một hình ảnh')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', avatarFile)

      const response = await userService.updateAvatar(formData)
      const updatedUser = { ...user, avatar: response.data.user.avatar }
      updateUser(updatedUser)
      setAvatar(response.data.user.avatar)
      setAvatarFile(null)

      showMessage('success', 'Avatar cập nhật thành công!')
    } catch (err) {
      console.error('Avatar upload error:', err)
      showMessage('error', err.response?.data?.error || 'Lỗi khi tải avatar')
    } finally {
      setLoading(false)
    }
  }

  // Update profile info
  const handleUpdateProfile = async () => {
    const nextErrors = {}

    if (!displayName.trim()) {
      nextErrors.displayName = 'Tên hiển thị không được để trống'
    }

    if (!bio.trim()) {
      nextErrors.bio = 'Bio không được để trống'
    }

    if (Object.keys(nextErrors).length > 0) {
      setProfileErrors(nextErrors)
      const missingLabels = []
      if (nextErrors.displayName) missingLabels.push('tên hiển thị')
      if (nextErrors.bio) missingLabels.push('bio')

      const missingMessage =
        missingLabels.length > 1
          ? `Vui lòng nhập đầy đủ ${missingLabels.join(' và ')} trước khi lưu.`
          : `Vui lòng nhập ${missingLabels[0]} trước khi lưu.`

      showMessage('error', missingMessage)

      if (nextErrors.displayName) {
        displayNameRef.current?.focus()
        return
      }

      bioRef.current?.focus()
      return
    }

    setProfileErrors({})
    setLoading(true)
    try {
      const response = await userService.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        province: profileLocation.province || '',
        district: profileLocation.district || '',
        location: profileLocation,
      })

      const responseUser = response.data?.user || {}
      const nextDisplayName =
        responseUser.fullName ||
        responseUser.displayName ||
        displayName.trim()
      const nextBio = responseUser.bio ?? bio.trim()
      const nextAvatar = responseUser.avatar || user?.avatar || avatar
      const nextProfileLocation = normalizeFormattedProfileLocation(responseUser.location, {
        province: responseUser.province ?? profileLocation.province,
        district: responseUser.district ?? profileLocation.district,
      })

      const updatedUser = {
        ...user,
        ...responseUser,
        displayName: responseUser.displayName || nextDisplayName,
        fullName: responseUser.fullName || nextDisplayName,
        bio: nextBio,
        avatar: nextAvatar,
        province: nextProfileLocation.province,
        district: nextProfileLocation.district,
        location: nextProfileLocation,
      }

      updateUser(updatedUser)
      setDisplayName(nextDisplayName)
      setBio(nextBio)
      setProfileLocation(nextProfileLocation)
      setAvatar(nextAvatar)
      setAvatarPreview(nextAvatar)

      await notify({
        title: 'Cập nhật thành công',
        message: 'Thông tin hồ sơ của bạn đã được lưu.',
        confirmText: 'Đóng',
        variant: 'success',
      })
    } catch (err) {
      console.error('Profile update error:', err)
      await notify({
        title: 'Cập nhật thất bại',
        message: err.response?.data?.error || 'Lỗi khi cập nhật hồ sơ',
        confirmText: 'Đã hiểu',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  // Change password
  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword) {
      showMessage('error', 'Vui lòng nhập mật khẩu hiện tại')
      return
    }

    if (!newPassword) {
      showMessage('error', 'Vui lòng nhập mật khẩu mới')
      return
    }

    if (newPassword.length < 6) {
      showMessage('error', 'Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }

    if (newPassword !== confirmPassword) {
      showMessage('error', 'Mật khẩu xác nhận không khớp')
      return
    }

    if (currentPassword === newPassword) {
      showMessage('error', 'Mật khẩu mới không được giống mật khẩu hiện tại')
      return
    }

    setLoading(true)
    try {
      await userService.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      })

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordModal(false)
      showMessage('success', 'Mật khẩu đã được thay đổi thành công!')
    } catch (err) {
      console.error('Password change error:', err)
      showMessage('error', err.response?.data?.error || 'Lỗi khi thay đổi mật khẩu')
    } finally {
      setLoading(false)
    }
  }

  // Logout
  const handleLogout = async () => {
    const shouldLogout = await confirm({
      title: 'Xác nhận đăng xuất',
      message: 'Bạn có chắc chắn muốn đăng xuất?',
      confirmText: 'Đăng xuất',
      cancelText: 'Ở lại',
      variant: 'warning',
    })

    if (!shouldLogout) return

    await logout()
    navigate('/auth/login')
  }

  const togglePasswordVisibility = (field) => {
    setShowPasswords({
      ...showPasswords,
      [field]: !showPasswords[field],
    })
  }

  const closePasswordModal = () => {
    if (loading) return
    setShowPasswordModal(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  useEffect(() => {
    if (!showPasswordModal) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closePasswordModal()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showPasswordModal, loading])

  return (
    <div className="profile-page">
      <div className="profile-container">
        {/* Header */}
        <div className="profile-header">
          <button className="back-btn" onClick={() => navigate('/')}>
            Quay Về
          </button>
          <h1>Hồ Sơ Cá Nhân</h1>
        </div>

        {/* Content */}
        <div className="profile-content">
          {/* Messages */}
          {message.text && (
            <div className={`${message.type}-message`}>
              {message.text}
            </div>
          )}

          {/* Avatar Section */}
          <div className="avatar-section">
            <div className="profile-avatar-container">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile" className="profile-avatar" />
              ) : (
                <div className="profile-avatar">Ảnh</div>
              )}
              <button
                className="avatar-upload-btn"
                onClick={() => document.getElementById('avatar-input').click()}
                title="Thay đổi avatar"
              >
                +
              </button>
              <input
                id="avatar-input"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
              />
            </div>

            {avatarFile && (
              <div className="profile-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleUploadAvatar}
                  disabled={loading}
                >
                  {loading ? 'Đang tải...' : 'Tải Avatar'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setAvatarFile(null)
                    setAvatarPreview(avatar)
                  }}
                  disabled={loading}
                >
                  Hủy
                </button>
              </div>
            )}
          </div>

          {/* Profile Info Section */}
          <div className="profile-section">
            <h2>Thông Tin Cá Nhân</h2>

            <div className="form-group">
              <label>Tên Hiển Thị</label>
              <input
                ref={displayNameRef}
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (profileErrors.displayName) {
                    setProfileErrors((current) => ({ ...current, displayName: '' }))
                  }
                }}
                placeholder="Nhập tên hiển thị"
                disabled={loading}
                required
                aria-invalid={Boolean(profileErrors.displayName)}
                aria-describedby={profileErrors.displayName ? 'display-name-error' : undefined}
              />
              {profileErrors.displayName ? (
                <small id="display-name-error" className="field-error-text">{profileErrors.displayName}</small>
              ) : null}
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                style={{ backgroundColor: '#e8e8e8' }}
              />
            </div>

            <div className="form-group">
              <label>Bio</label>
              <textarea
                ref={bioRef}
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value)
                  if (profileErrors.bio) {
                    setProfileErrors((current) => ({ ...current, bio: '' }))
                  }
                }}
                placeholder="Viết một chút về bạn..."
                disabled={loading}
                maxLength={200}
                required
                aria-invalid={Boolean(profileErrors.bio)}
                aria-describedby={profileErrors.bio ? 'bio-error bio-count' : 'bio-count'}
              />
              {profileErrors.bio ? (
                <small id="bio-error" className="field-error-text">{profileErrors.bio}</small>
              ) : null}
              <small id="bio-count">{bio.length}/200</small>
            </div>

            <div className="form-group">
              <label>Khu vực sinh sống</label>
              <button
                type="button"
                className="profile-location-button"
                onClick={() => setShowLocationPicker(true)}
                disabled={loading}
              >
                <span>
                  <strong>{formatLocationLabel(profileLocation)}</strong>
                  <small>{formatCoordinates(profileLocation) || 'Chọn trên bản đồ để tự nhận diện và chuẩn hóa địa chỉ'}</small>
                </span>
                <em>Chọn bản đồ</em>
              </button>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleUpdateProfile}
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Đang cập nhật...' : 'Lưu Thay Đổi'}
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => setShowPasswordModal(true)}
              style={{ width: '100%', marginTop: '10px' }}
            >
              Đổi Mật Khẩu
            </button>
          </div>

          {/* Logout Button */}
          <button className="logout-btn" onClick={handleLogout}>
            Đăng Xuất
          </button>
        </div>
      </div>

      {showPasswordModal && (
        <div className="profile-modal-backdrop" role="presentation" onMouseDown={closePasswordModal}>
          <div
            className="profile-password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="profile-modal-header">
              <div>
                <h2 id="password-modal-title">Đổi Mật Khẩu</h2>
                <p>Cập nhật mật khẩu để giữ tài khoản an toàn.</p>
              </div>
              <button type="button" className="profile-modal-close" onClick={closePasswordModal} aria-label="Đóng">
                ×
              </button>
            </div>

            {message.text && message.type === 'error' ? (
              <div className="error-message">{message.text}</div>
            ) : null}

            <form
              className="password-form-container"
              onSubmit={(event) => {
                event.preventDefault()
                handleChangePassword()
              }}
            >
              <div className="form-group password-group">
                <label>Mật Khẩu Hiện Tại</label>
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                  disabled={loading}
                  autoFocus
                />
                <button
                  className="toggle-password"
                  onClick={() => togglePasswordVisibility('current')}
                  type="button"
                >
                  {showPasswords.current ? 'Ẩn' : 'Hiện'}
                </button>
              </div>

              <div className="form-group password-group">
                <label>Mật Khẩu Mới</label>
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới"
                  disabled={loading}
                />
                <button
                  className="toggle-password"
                  onClick={() => togglePasswordVisibility('new')}
                  type="button"
                >
                  {showPasswords.new ? 'Ẩn' : 'Hiện'}
                </button>
              </div>

              <div className="form-group password-group">
                <label>Xác Nhận Mật Khẩu</label>
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  disabled={loading}
                />
                <button
                  className="toggle-password"
                  onClick={() => togglePasswordVisibility('confirm')}
                  type="button"
                >
                  {showPasswords.confirm ? 'Ẩn' : 'Hiện'}
                </button>
              </div>

              <div className="profile-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closePasswordModal} disabled={loading}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-danger" disabled={loading}>
                  {loading ? 'Đang xử lý...' : 'Xác Nhận Đổi Mật Khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLocationPicker ? (
        <ProfileLocationPicker
          value={profileLocation}
          onChange={setProfileLocation}
          onClose={closeLocationPicker}
        />
      ) : null}
    </div>
  )
}

export default ProfilePage
