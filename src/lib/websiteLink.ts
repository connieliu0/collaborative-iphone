const IG_POST_RE =
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i

function instagramPermalink(kind: string, shortcode: string): string {
  const type = kind.toLowerCase() === 'reels' ? 'reel' : kind.toLowerCase()
  return `https://www.instagram.com/${type}/${shortcode}/`
}

function findInstagramMatch(text: string): RegExpMatchArray | null {
  return text.match(IG_POST_RE)
}

/** Normalize a pasted URL or Instagram embed snippet into a storeable https URL. */
export function parseWebsiteLinkInput(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { error: 'Enter a link' }

  const permalinkAttr = trimmed.match(/data-instgrm-permalink=["']([^"']+)["']/i)
  const fromAttr = permalinkAttr?.[1]
  const ig = (fromAttr && findInstagramMatch(fromAttr)) || findInstagramMatch(trimmed)
  if (ig) {
    return { url: instagramPermalink(ig[1], ig[2]) }
  }

  const looksLikeHtml = trimmed.startsWith('<') || trimmed.includes('instagram-media')
  if (looksLikeHtml) {
    return { error: 'Could not find an Instagram post in that embed code' }
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

/** Iframe src that sites actually allow (Instagram post pages themselves cannot be framed). */
export function iframeSrcForWebsiteUrl(url: string): string {
  const ig = findInstagramMatch(url)
  if (!ig) return url
  const type = ig[1].toLowerCase() === 'reels' ? 'reel' : ig[1].toLowerCase()
  return `https://www.instagram.com/${type}/${ig[2]}/embed/captioned/`
}

export function websiteHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
