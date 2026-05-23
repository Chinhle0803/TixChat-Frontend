const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/$/, '')

const isLocalHost = (hostname = '') => (
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '0.0.0.0'
)

const shouldUseSecurePageProxy = (rawUrl = '') => {
  if (typeof window === 'undefined' || window.location?.protocol !== 'https:') return false

  try {
    const parsedUrl = new URL(rawUrl)
    return parsedUrl.protocol === 'http:' && !isLocalHost(parsedUrl.hostname)
  } catch {
    return false
  }
}

export const normalizeBaseUrl = (value) => trimTrailingSlash(value)

export const resolveApiBaseUrl = (configuredUrl) => {
  const normalizedUrl = normalizeBaseUrl(configuredUrl)
  if (normalizedUrl && shouldUseSecurePageProxy(normalizedUrl)) {
    return '/api'
  }

  if (normalizedUrl) return normalizedUrl

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${protocol}//${window.location.hostname}:5000/api`
  }

  return 'http://localhost:5000/api'
}
