const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/$/, '')
const warnedKeys = new Set()

export const isLocalHost = (hostname = '') => (
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '0.0.0.0'
)

const isBrowser = () => typeof window !== 'undefined'

const warnOnce = (key, message) => {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.error(message)
}

const upgradeToHttpsWhenNeeded = (rawUrl = '') => {
  const normalizedUrl = trimTrailingSlash(rawUrl)
  if (!normalizedUrl) return ''

  try {
    const parsedUrl = new URL(normalizedUrl)
    if (
      isBrowser() &&
      window.location?.protocol === 'https:' &&
      parsedUrl.protocol === 'http:' &&
      !isLocalHost(parsedUrl.hostname)
    ) {
      parsedUrl.protocol = 'https:'
      return trimTrailingSlash(parsedUrl.toString())
    }

    return normalizedUrl
  } catch {
    return normalizedUrl
  }
}

const resolveLocalBackendOrigin = () => {
  if (isBrowser() && isLocalHost(window.location?.hostname || '')) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${protocol}//${window.location.hostname}:5000`
  }

  return 'http://localhost:5000'
}

export const normalizeBaseUrl = (value) => trimTrailingSlash(value)

export const isNgrokUrl = (value = '') => {
  const normalizedUrl = trimTrailingSlash(value)
  if (!normalizedUrl) return false

  try {
    const { hostname } = new URL(normalizedUrl)
    return hostname.endsWith('.ngrok-free.dev') || hostname.endsWith('.ngrok.app')
  } catch {
    return false
  }
}

export const getNgrokBypassHeaders = (value = '') => (
  isNgrokUrl(value)
    ? { 'ngrok-skip-browser-warning': 'true' }
    : {}
)

export const resolveApiBaseUrl = (configuredUrl) => {
  const normalizedUrl = upgradeToHttpsWhenNeeded(configuredUrl)
  if (normalizedUrl) return normalizedUrl

  if (isBrowser() && isLocalHost(window.location?.hostname || '')) {
    return `${resolveLocalBackendOrigin()}/api`
  }

  if (isBrowser()) {
    warnOnce(
      'missing-api-url',
      'Missing VITE_API_URL for a non-local deployment. Set an HTTPS backend URL such as https://api.example.com/api.'
    )
    return '/api'
  }

  return 'http://localhost:5000/api'
}

export const resolveSocketBaseUrl = (configuredUrl) => {
  const normalizedUrl = upgradeToHttpsWhenNeeded(configuredUrl)
  if (normalizedUrl) return normalizedUrl

  if (isBrowser() && isLocalHost(window.location?.hostname || '')) {
    return resolveLocalBackendOrigin()
  }

  if (isBrowser()) {
    warnOnce(
      'missing-socket-url',
      'Missing VITE_SOCKET_URL for a non-local deployment. Set an HTTPS backend URL such as https://api.example.com.'
    )
    return window.location.origin
  }

  return 'http://localhost:5000'
}
