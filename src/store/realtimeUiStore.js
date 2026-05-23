import { create } from 'zustand'

const MAX_BANNERS = 2

const getBannerKey = (banner = {}) =>
  String(
    banner?.data?.callId ||
    banner?.data?.messageId ||
    banner?.id ||
    ''
  ).trim()

const getBannerPriority = (banner = {}) => {
  const type = String(banner?.type || '').toLowerCase()
  if (type === 'call') return 2
  if (type === 'message') return 1
  return 0
}

const sortBanners = (items = []) =>
  [...items].sort((left, right) => {
    const priorityDiff = getBannerPriority(right) - getBannerPriority(left)
    if (priorityDiff !== 0) return priorityDiff

    const createdLeft = Number(left?.createdAt || 0)
    const createdRight = Number(right?.createdAt || 0)
    return createdRight - createdLeft
  })

const normalizeBanner = (banner = {}) => {
  const createdAt = Number(banner?.createdAt || Date.now())
  return {
    id: String(banner?.id || `banner-${createdAt}`),
    type: String(banner?.type || 'system'),
    title: String(banner?.title || 'Thông báo'),
    body: String(banner?.body || ''),
    data: banner?.data && typeof banner.data === 'object' ? banner.data : {},
    persistent: Boolean(banner?.persistent),
    createdAt,
    expiresAt: banner?.persistent ? null : Number(banner?.expiresAt || createdAt + 5000),
  }
}

export const useRealtimeUiStore = create((set) => ({
  banners: [],

  upsertBanner: (banner) =>
    set((state) => {
      const normalizedBanner = normalizeBanner(banner)
      const nextKey = getBannerKey(normalizedBanner)

      const remaining = (state.banners || []).filter((currentBanner) => {
        const currentKey = getBannerKey(currentBanner)
        if (normalizedBanner.id && currentBanner.id === normalizedBanner.id) return false
        if (nextKey && currentKey && nextKey === currentKey) return false
        return true
      })

      return {
        banners: sortBanners([...remaining, normalizedBanner]).slice(0, MAX_BANNERS),
      }
    }),

  dismissBanner: (bannerId) =>
    set((state) => ({
      banners: (state.banners || []).filter((banner) => banner.id !== bannerId),
    })),

  dismissMatching: (matcher) =>
    set((state) => ({
      banners:
        typeof matcher === 'function'
          ? (state.banners || []).filter((banner) => !matcher(banner))
          : state.banners || [],
    })),
}))

export default useRealtimeUiStore
