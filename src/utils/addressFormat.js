const DIRECT_CONTROLLED_CITIES = {
  'ho chi minh': 'Thành phố Hồ Chí Minh',
  'sai gon': 'Thành phố Hồ Chí Minh',
  hcm: 'Thành phố Hồ Chí Minh',
  tphcm: 'Thành phố Hồ Chí Minh',
  'tp hcm': 'Thành phố Hồ Chí Minh',
  'ha noi': 'Thành phố Hà Nội',
  hanoi: 'Thành phố Hà Nội',
  'hai phong': 'Thành phố Hải Phòng',
  'da nang': 'Thành phố Đà Nẵng',
  'can tho': 'Thành phố Cần Thơ',
  hue: 'Thành phố Huế',
}

const resolveDirectControlledCity = (comparable = '') => {
  if (!comparable) return ''
  if (comparable.includes('ho chi minh') || comparable.includes('sai gon') || comparable === 'hcm' || comparable === 'tphcm' || comparable === 'tp hcm') {
    return DIRECT_CONTROLLED_CITIES['ho chi minh']
  }
  if (comparable.includes('ha noi') || comparable.includes('hanoi')) {
    return DIRECT_CONTROLLED_CITIES['ha noi']
  }
  if (comparable.includes('hai phong')) {
    return DIRECT_CONTROLLED_CITIES['hai phong']
  }
  if (comparable.includes('da nang')) {
    return DIRECT_CONTROLLED_CITIES['da nang']
  }
  if (comparable.includes('can tho')) {
    return DIRECT_CONTROLLED_CITIES['can tho']
  }
  if (comparable.includes('hue')) {
    return DIRECT_CONTROLLED_CITIES.hue
  }
  return ''
}

const DIRECT_CONTROLLED_CITY_CODES = {
  'VN-SG': 'Thành phố Hồ Chí Minh',
  'VN-HN': 'Thành phố Hà Nội',
  'VN-HP': 'Thành phố Hải Phòng',
  'VN-DN': 'Thành phố Đà Nẵng',
  'VN-CT': 'Thành phố Cần Thơ',
  'VN-TTH': 'Thành phố Huế',
}

const PLACEHOLDER_LABELS = new Set([
  'vi tri da chon tren ban do',
  'vi tri da chon',
  'vi tri hien tai',
])

const toComparable = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const cleanSegment = (value = '') => String(value || '').replace(/\s+/g, ' ').trim().replace(/^,+|,+$/g, '')

const splitAddressSegments = (value = '') =>
  String(value || '')
    .split(',')
    .map((segment) => cleanSegment(segment))
    .filter(Boolean)

const toDisplayCase = (value = '') => cleanSegment(value)
  .split(' ')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ')

const stripLeadingLabel = (value = '', patterns = []) => {
  let next = cleanSegment(value)
  patterns.forEach((pattern) => {
    next = next.replace(pattern, '').trim()
  })
  return cleanSegment(next)
}

const stripRepeatedLeadingLabels = (value = '', patterns = []) => {
  let next = cleanSegment(value)
  let changed = true

  while (changed) {
    changed = false
    patterns.forEach((pattern) => {
      const replaced = cleanSegment(next.replace(pattern, ''))
      if (replaced !== next) {
        next = replaced
        changed = true
      }
    })
  }

  return cleanSegment(next)
}

const administrativeBase = (value = '') =>
  toComparable(
    stripRepeatedLeadingLabels(value, [
      /^tp\.?\s*/i,
      /^thanh pho\s+/i,
      /^tinh\s+/i,
      /^q\.?\s*/i,
      /^quan\s+/i,
      /^huyen\s+/i,
      /^thi xa\s+/i,
      /^ph(?:ường|uong)\s+/i,
      /^xa\s+/i,
      /^thi tran\s+/i,
      /^thon\s+/i,
      /^xom\s+/i,
      /^ap\s+/i,
      /^ban\s+/i,
      /^to dan pho\s+/i,
      /^khu pho\s+/i,
    ])
  )

const uniqueSegments = (segments = []) => {
  const seen = new Set()
  const results = []

  segments.forEach((segment) => {
    const cleaned = cleanSegment(segment)
    if (!cleaned) return
    const comparable = toComparable(cleaned)
    if (!comparable || seen.has(comparable)) return
    seen.add(comparable)
    results.push(cleaned)
  })

  return results
}

const isCountrySegment = (value = '') => {
  const comparable = toComparable(value)
  return comparable === 'viet nam' || comparable === 'vietnam'
}

const isMeaningfulAddress = (value = '') => {
  const comparable = toComparable(value)
  return Boolean(comparable && !PLACEHOLDER_LABELS.has(comparable))
}

const isWardLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return comparable.startsWith('phuong ') || comparable.startsWith('xa ') || comparable.startsWith('thi tran ')
}

const isDistrictLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return (
    comparable.startsWith('quan ') ||
    comparable.startsWith('huyen ') ||
    comparable.startsWith('thi xa ') ||
    comparable.startsWith('thanh pho ') ||
    /^q\.?\s*\d{1,2}$/.test(comparable)
  )
}

const isProvinceLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return Boolean(
    DIRECT_CONTROLLED_CITIES[comparable] ||
    comparable.startsWith('tinh ') ||
    comparable.startsWith('thanh pho ') ||
    comparable.startsWith('tp ')
  )
}

const isLocalityLikeSegment = (value = '') => {
  const comparable = toComparable(value)
  return (
    comparable.startsWith('thon ') ||
    comparable.startsWith('xom ') ||
    comparable.startsWith('ap ') ||
    comparable.startsWith('ban ') ||
    comparable.startsWith('to dan pho ') ||
    comparable.startsWith('khu pho ')
  )
}

const canonicalizeProvince = (value = '', isoCode = '') => {
  const code = String(isoCode || '').trim().toUpperCase()
  if (DIRECT_CONTROLLED_CITY_CODES[code]) {
    return DIRECT_CONTROLLED_CITY_CODES[code]
  }

  const raw = cleanSegment(value)
  if (!raw) return ''

  const comparable = toComparable(raw)
  if (!comparable) return ''

  const directControlledCity = resolveDirectControlledCity(comparable)
  if (directControlledCity) {
    return directControlledCity
  }

  if (comparable.startsWith('thanh pho ') || comparable.startsWith('tp ')) {
    const nextValue = stripRepeatedLeadingLabels(raw, [/^tp\.?\s*/i, /^thanh pho\s+/i])
    const nestedComparable = toComparable(nextValue)
    const nestedDirectControlledCity = resolveDirectControlledCity(nestedComparable)
    if (nestedDirectControlledCity) {
      return nestedDirectControlledCity
    }
    return `Thành phố ${toDisplayCase(nextValue)}`
  }

  return `Tỉnh ${toDisplayCase(stripRepeatedLeadingLabels(raw, [/^tinh\s+/i])) || toDisplayCase(raw)}`
}

const canonicalizeDistrict = (value = '') => {
  const raw = cleanSegment(value)
  if (!raw) return ''

  const comparable = toComparable(raw)
  if (!comparable) return ''

  const districtNumber = comparable.match(/^(q|quan)\s*(\d{1,2})$/)
  if (districtNumber) return `Quận ${districtNumber[2]}`
  if (comparable.startsWith('quan ')) return `Quận ${toDisplayCase(stripLeadingLabel(raw, [/^quan\s+/i]))}`
  if (comparable.startsWith('huyen ')) return `Huyện ${toDisplayCase(stripLeadingLabel(raw, [/^huyen\s+/i]))}`
  if (comparable.startsWith('thi xa ')) return `Thị xã ${toDisplayCase(stripLeadingLabel(raw, [/^thi xa\s+/i]))}`
  if (comparable.startsWith('thanh pho ')) return `Thành phố ${toDisplayCase(stripLeadingLabel(raw, [/^thanh pho\s+/i]))}`

  return toDisplayCase(raw)
}

const canonicalizeWard = (value = '') => {
  const raw = cleanSegment(value)
  if (!raw) return ''

  const comparable = toComparable(raw)
  if (!comparable) return ''

  if (comparable.startsWith('phuong ')) return `Phường ${toDisplayCase(raw.replace(/^ph(?:ường|uong)\s+/i, '').trim())}`
  if (comparable.startsWith('xa ')) return `Xã ${toDisplayCase(stripLeadingLabel(raw, [/^xa\s+/i]))}`
  if (comparable.startsWith('thi tran ')) return `Thị trấn ${toDisplayCase(stripLeadingLabel(raw, [/^thi tran\s+/i]))}`

  return toDisplayCase(raw)
}

const canonicalizeLocality = (value = '') => {
  const raw = cleanSegment(value)
  if (!raw) return ''

  const mappings = [
    [/^thon\s+/i, 'Thôn'],
    [/^xom\s+/i, 'Xóm'],
    [/^ap\s+/i, 'Ấp'],
    [/^ban\s+/i, 'Bản'],
    [/^to dan pho\s+/i, 'Tổ dân phố'],
    [/^khu pho\s+/i, 'Khu phố'],
  ]

  for (const [pattern, label] of mappings) {
    if (pattern.test(raw)) {
      return `${label} ${toDisplayCase(stripLeadingLabel(raw, [pattern]))}`
    }
  }

  return toDisplayCase(raw)
}

const extractStructuredAddress = (address = '') => {
  const segments = splitAddressSegments(address)
  const leadSegments = []
  let locality = ''
  let ward = ''
  let district = ''
  let province = ''

  segments.forEach((segment) => {
    if (isCountrySegment(segment)) return
    if (!province && isProvinceLikeSegment(segment)) {
      province = canonicalizeProvince(segment)
      return
    }
    if (!district && isDistrictLikeSegment(segment)) {
      district = canonicalizeDistrict(segment)
      return
    }
    if (!ward && isWardLikeSegment(segment)) {
      ward = canonicalizeWard(segment)
      return
    }
    if (!locality && isLocalityLikeSegment(segment)) {
      locality = canonicalizeLocality(segment)
      return
    }

    leadSegments.push(cleanSegment(segment))
  })

  return { leadSegments: uniqueSegments(leadSegments), locality, ward, district, province }
}

const formatVietnameseAddressFromParts = ({
  leadSegments = [],
  locality = '',
  ward = '',
  district = '',
  province = '',
} = {}) =>
  (() => {
    const normalizedLocality = canonicalizeLocality(locality)
    const normalizedWard = canonicalizeWard(ward)
    let normalizedDistrict = canonicalizeDistrict(district)
    const normalizedProvince = canonicalizeProvince(province)

    if (administrativeBase(normalizedDistrict) && administrativeBase(normalizedDistrict) === administrativeBase(normalizedWard)) {
      normalizedDistrict = ''
    }
    const safeLocality =
      administrativeBase(normalizedLocality) && administrativeBase(normalizedLocality) === administrativeBase(normalizedWard)
        ? ''
        : normalizedLocality

    return uniqueSegments([
      ...leadSegments,
      safeLocality,
      normalizedWard,
      normalizedDistrict,
      normalizedProvince,
    ]).join(', ')
  })()

export const formatLocationAddress = (location = {}) => {
  const address = cleanSegment(location?.address || '')
  const structured = extractStructuredAddress(address)
  const district = canonicalizeDistrict(location?.district || structured.district || '')
  const province = canonicalizeProvince(location?.province || structured.province || '')

  return formatVietnameseAddressFromParts({
    leadSegments: structured.leadSegments,
    locality: structured.locality,
    ward: structured.ward,
    district,
    province,
  })
}

export const formatLocationLabel = (location = {}) =>
  formatLocationAddress(location) ||
  [cleanSegment(location?.district), cleanSegment(location?.province)].filter(Boolean).join(', ') ||
  'Chưa chọn địa chỉ'

export const normalizeProfileLocation = (location = {}, fallbackUser = {}) => {
  const province = cleanSegment(location?.province || fallbackUser?.province || '')
  const district = cleanSegment(location?.district || fallbackUser?.district || '')
  const lat = location?.lat ?? ''
  const lng = location?.lng ?? ''

  return {
    address: formatLocationAddress({
      address: location?.address || '',
      district,
      province,
    }),
    lat,
    lng,
    province: canonicalizeProvince(province),
    district: canonicalizeDistrict(district),
  }
}

export const extractLocationFromReverseGeocode = (data = {}, coordinates = {}) => {
  const address = data?.address || {}
  const streetLine = cleanSegment([address.house_number, address.road || address.pedestrian || address.street].filter(Boolean).join(' '))
  const locality = canonicalizeLocality(
    address.hamlet ||
    address.village ||
    address.quarter ||
    address.neighbourhood ||
    address.residential ||
    ''
  )
  const ward = canonicalizeWard(address.ward || address.suburb || '')
  const district = canonicalizeDistrict(
    address.city_district ||
    address.district ||
    address.county ||
    address.borough ||
    ''
  )
  const province = canonicalizeProvince(
    address.state ||
    address.province ||
    address.region ||
    address.city ||
    '',
    address['ISO3166-2-lvl4'] || ''
  )

  const formattedAddress = formatVietnameseAddressFromParts({
    leadSegments: streetLine ? [streetLine] : [],
    locality,
    ward,
    district,
    province,
  })

  return {
    address: formattedAddress || `Vị trí đã chọn (${Number(coordinates.lat || 0).toFixed(5)}, ${Number(coordinates.lng || 0).toFixed(5)})`,
    lat: coordinates.lat,
    lng: coordinates.lng,
    province,
    district,
  }
}

export const getLocationInputPlaceholder = () =>
  'Số nhà, ngõ/ngách đường, thôn/xóm, xã/phường, huyện/quận, tỉnh/thành phố'

export { isMeaningfulAddress, canonicalizeProvince, canonicalizeDistrict }
