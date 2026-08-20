const IG_POST_RE =
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i

/** Paths that look like usernames but are Instagram product routes. */
const IG_RESERVED_USERNAMES = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'about',
  'legal',
  'developer',
  'directory',
  'web',
  'api',
  'graphql',
  'embed',
  'direct',
  'nametag',
  'guides',
])

const IG_PROFILE_RE =
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#]|["']|$)/i

function instagramPermalink(kind: string, shortcode: string): string {
  const type = kind.toLowerCase() === 'reels' ? 'reel' : kind.toLowerCase()
  return `https://www.instagram.com/${type}/${shortcode}/`
}

function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}

function findInstagramPostMatch(text: string): RegExpMatchArray | null {
  return text.match(IG_POST_RE)
}

function findInstagramProfileUsername(text: string): string | null {
  const match = text.match(IG_PROFILE_RE)
  if (!match) return null
  const username = match[1]
  if (IG_RESERVED_USERNAMES.has(username.toLowerCase())) return null
  return username
}

/** Normalize a pasted URL or Instagram embed snippet into a storeable https URL. */
export function parseWebsiteLinkInput(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { error: 'Enter a link' }

  const permalinkAttr = trimmed.match(/data-instgrm-permalink=["']([^"']+)["']/i)
  const fromAttr = permalinkAttr?.[1]
    ? decodeBasicHtmlEntities(permalinkAttr[1])
    : undefined
  const searchText = fromAttr ?? trimmed

  const post = findInstagramPostMatch(searchText) || findInstagramPostMatch(trimmed)
  if (post) {
    return { url: instagramPermalink(post[1], post[2]) }
  }

  const profile =
    findInstagramProfileUsername(searchText) || findInstagramProfileUsername(trimmed)
  if (profile) {
    return { url: instagramProfileUrl(profile) }
  }

  const looksLikeHtml = trimmed.startsWith('<') || trimmed.includes('instagram-media')
  if (looksLikeHtml) {
    return { error: 'Could not find an Instagram post or profile in that embed code' }
  }

  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withProto)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Enter a website URL or Instagram embed code' }
    }
    return { url: parsed.toString() }
  } catch {
    return { error: 'Enter a website URL or Instagram embed code' }
  }
}

/** Iframe src that sites actually allow (Instagram pages themselves often cannot be framed). */
export function iframeSrcForWebsiteUrl(url: string): string {
  const post = findInstagramPostMatch(url)
  if (post) {
    const type = post[1].toLowerCase() === 'reels' ? 'reel' : post[1].toLowerCase()
    return `https://www.instagram.com/${type}/${post[2]}/embed/captioned/`
  }
  const profile = findInstagramProfileUsername(url)
  if (profile) {
    return `https://www.instagram.com/${profile}/embed`
  }
  return url
}

export function websiteHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function isInstagramEmbed(url: string): boolean {
  return findInstagramPostMatch(url) !== null || findInstagramProfileUsername(url) !== null
}
