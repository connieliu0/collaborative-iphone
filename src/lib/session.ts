import { supabase } from './supabase'
import { DEFAULT_COMIC_FONT_COLOR, DEFAULT_COMIC_FONT_SIZE, DEFAULT_OVERLAY_Y } from './comicCaptionStyle'

const BUCKET = 'comic-frames'

export type SessionRound = 'lobby' | 'images' | 'phrases' | 'compose' | 'voting' | 'complete' | 'contribute' | 'present'

export type SessionType = 'collab' | 'performance'

export type SubStep = 'image' | 'phrase'

export interface SessionRow {
  id: string
  code: string
  host_id: string
  round: SessionRound
  round_number: number
  sub_step: SubStep
  session_type: SessionType
  created_at: string
  final_comic_id: string | null
}

export interface SessionMemberRow {
  id: string
  session_id: string
  user_id: string
  joined_at: string
  username?: string
}

export interface SessionImageRow {
  id: string
  session_id: string
  user_id: string
  image_url: string
  round_number: number | null
  created_at: string
}

export interface SessionPhraseRow {
  id: string
  session_id: string
  user_id: string
  text: string
  used_by: string | null
  round_number: number | null
  created_at: string
}

export interface SessionPairingRow {
  id: string
  session_id: string
  user_id: string
  image_url: string
  phrase_text: string
  featured: boolean
  created_at: string
}

export interface SessionMatchupRow {
  id: string
  session_id: string
  round_number: number
  option_a_image_url: string
  option_a_caption: string
  option_b_image_url: string
  option_b_caption: string
  winner: string | null
}

export interface SessionVoteRow {
  id: string
  matchup_id: string
  user_id: string
  choice: string
  created_at: string
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function createSession(
  hostId: string,
  sessionType: SessionType = 'collab'
): Promise<{ code: string; sessionId: string } | { error: string }> {
  const code = generateCode()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({ code, host_id: hostId, round: 'lobby', session_type: sessionType })
    .select('id')
    .single()

  if (sessionError || !session) {
    return { error: sessionError?.message ?? 'Failed to create session' }
  }

  const { error: memberError } = await supabase
    .from('session_members')
    .insert({ session_id: session.id, user_id: hostId })

  if (memberError) {
    return { error: memberError.message }
  }

  return { code, sessionId: session.id }
}

export async function joinSession(code: string, userId: string): Promise<{ sessionId: string } | { error: string }> {
  const normalized = code.trim().toUpperCase()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, round, session_type')
    .eq('code', normalized)
    .maybeSingle()

  if (sessionError || !session) {
    return { error: 'Session not found' }
  }

  const isPerformance = (session as { session_type: string }).session_type === 'performance'
  if (!isPerformance && session.round !== 'lobby') {
    return { error: 'Session already started' }
  }
  if (isPerformance && session.round === 'complete') {
    return { error: 'Session has ended' }
  }

  const { error: memberError } = await supabase
    .from('session_members')
    .insert({ session_id: session.id, user_id: userId })

  if (memberError) {
    if (memberError.code === '23505') {
      return { sessionId: session.id }
    }
    return { error: memberError.message }
  }

  return { sessionId: session.id }
}

export async function fetchSession(code: string): Promise<{
  session: SessionRow
  members: SessionMemberRow[]
} | { error: string }> {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (sessionError || !session) {
    return { error: sessionError?.message ?? 'Session not found' }
  }

  const { data: members, error: membersError } = await supabase
    .from('session_members')
    .select('id, session_id, user_id, joined_at')
    .eq('session_id', session.id)
    .order('joined_at', { ascending: true })

  if (membersError) {
    return { error: membersError.message }
  }

  const userIds = (members ?? []).map((m: SessionMemberRow) => m.user_id)
  let profileMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds)

    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p: { id: string; username: string }) => [p.id, p.username]))
    }
  }

  const enrichedMembers = (members ?? []).map((m: SessionMemberRow) => ({
    ...m,
    username: profileMap[m.user_id] ?? `Player ${m.user_id.slice(0, 4)}`,
  }))

  return { session: session as SessionRow, members: enrichedMembers }
}

export async function advanceRound(
  sessionId: string,
  hostId: string,
  newRound: SessionRound,
  newRoundNumber?: number,
  newSubStep?: SubStep
): Promise<{ error?: string }> {
  const update: Record<string, unknown> = { round: newRound }
  if (newRoundNumber !== undefined) update.round_number = newRoundNumber
  if (newSubStep !== undefined) update.sub_step = newSubStep

  const { error } = await supabase
    .from('sessions')
    .update(update)
    .eq('id', sessionId)
    .eq('host_id', hostId)

  if (error) return { error: error.message }
  return {}
}

function getFileExtension(file: File): string {
  if (/^image\/(heic|heif)/i.test(file.type)) return '.jpg'
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  if (lastDot === -1) return '.png'
  const ext = name.slice(lastDot).toLowerCase()
  if (/\.heic$/i.test(ext)) return '.jpg'
  return /\.(jpe?g|png|gif|webp)$/.test(ext) ? ext : '.png'
}

export async function submitImages(
  sessionId: string,
  userId: string,
  files: File[],
  roundNumber?: number
): Promise<{ error?: string }> {
  const rows: { session_id: string; user_id: string; image_url: string; round_number?: number }[] = []

  for (const file of files) {
    const ext = getFileExtension(file)
    const path = `${userId}/sessions/${sessionId}/${crypto.randomUUID()}${ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'image/png', upsert: false })

    if (uploadError) return { error: uploadError.message }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const row: typeof rows[number] = { session_id: sessionId, user_id: userId, image_url: urlData.publicUrl }
    if (roundNumber !== undefined) row.round_number = roundNumber
    rows.push(row)
  }

  const { error } = await supabase.from('session_images').insert(rows)
  if (error) return { error: error.message }
  return {}
}

export async function getSessionImages(sessionId: string): Promise<SessionImageRow[]> {
  const { data } = await supabase
    .from('session_images')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SessionImageRow[]
}

export async function submitPhrases(
  sessionId: string,
  userId: string,
  phrases: string[],
  roundNumber?: number
): Promise<{ error?: string }> {
  const rows = phrases.map((text) => {
    const row: { session_id: string; user_id: string; text: string; round_number?: number } =
      { session_id: sessionId, user_id: userId, text }
    if (roundNumber !== undefined) row.round_number = roundNumber
    return row
  })
  const { error } = await supabase.from('session_phrases').insert(rows)
  if (error) return { error: error.message }
  return {}
}

export async function getSessionPhrases(sessionId: string): Promise<SessionPhraseRow[]> {
  const { data } = await supabase
    .from('session_phrases')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SessionPhraseRow[]
}

export async function claimPhrase(phraseId: string, userId: string): Promise<{ error?: string }> {
  const { error, count } = await supabase
    .from('session_phrases')
    .update({ used_by: userId })
    .eq('id', phraseId)
    .is('used_by', null)

  if (error) return { error: error.message }
  if (count === 0) return { error: 'Phrase already claimed' }
  return {}
}

export async function releasePhrase(phraseId: string, userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('session_phrases')
    .update({ used_by: null })
    .eq('id', phraseId)
    .eq('used_by', userId)

  if (error) return { error: error.message }
  return {}
}

export async function publishPersonalComic(
  userId: string,
  sessionId: string,
  frames: { image_url: string; caption: string }[]
): Promise<{ slug: string; comicId: string } | { error: string }> {
  if (frames.length === 0) return { error: 'No frames' }

  const slug = crypto.randomUUID().slice(0, 8)

  const { data: comicRow, error: comicError } = await supabase
    .from('comics')
    .insert({
      slug,
      owner_id: userId,
      title: 'Session Comic',
      status: 'complete',
      mode: 'solo',
      session_id: sessionId,
    })
    .select('id')
    .single()

  if (comicError || !comicRow) {
    return { error: comicError?.message ?? 'Failed to create comic' }
  }

  const comicId = (comicRow as { id: string }).id

  const frameRows = frames.map((f, i) => ({
    comic_id: comicId,
    order: i,
    image_url: f.image_url,
    // For collab, store phrases as the standard bottom caption strip.
    // (Overlay text is intentionally left blank.)
    caption: f.caption,
    overlay_x: 50,
    overlay_y: DEFAULT_OVERLAY_Y,
    font_size: DEFAULT_COMIC_FONT_SIZE,
    font_color: DEFAULT_COMIC_FONT_COLOR,
  }))

  const { error: framesError } = await supabase.from('frames').insert(frameRows)
  if (framesError) return { error: framesError.message }

  return { slug, comicId }
}

export async function getPersonalComics(sessionId: string): Promise<{
  id: string
  slug: string
  owner_id: string
  title: string
}[]> {
  const { data } = await supabase
    .from('comics')
    .select('id, slug, owner_id, title')
    .eq('session_id', sessionId)
    // Latest first so when we dedupe by owner we keep each player's most recent comic.
    .order('created_at', { ascending: false })

  const ordered = (data ?? []) as { id: string; slug: string; owner_id: string; title: string }[]

  // If a user re-publishes (or retries), we may have multiple comics for the same session_id.
  // The game logic + UI should treat that as "one player, one comic".
  const byOwner = new Map<string, { id: string; slug: string; owner_id: string; title: string }>()
  for (const comic of ordered) {
    if (!byOwner.has(comic.owner_id)) byOwner.set(comic.owner_id, comic)
  }

  return Array.from(byOwner.values())
}

interface FrameForMatchup {
  image_url: string
  caption: string
}

export async function generateMatchups(
  sessionId: string,
  memberCount: number
): Promise<{ error?: string }> {
  const comics = await getPersonalComics(sessionId)
  if (comics.length === 0) return { error: 'No personal comics found' }

  const allFrames: FrameForMatchup[] = []
  for (const comic of comics) {
    const { data: frames } = await supabase
      .from('frames')
      .select('image_url, caption')
      .eq('comic_id', comic.id)
      .order('order', { ascending: true })
    if (frames) allFrames.push(...(frames as FrameForMatchup[]))
  }

  if (allFrames.length < 2) return { error: 'Not enough frames for matchups' }

  const shuffled = [...allFrames].sort(() => Math.random() - 0.5)
  const numMatchups = Math.min(memberCount, Math.floor(shuffled.length / 2))

  const matchups = []
  for (let i = 0; i < numMatchups; i++) {
    const a = shuffled[i * 2]
    const b = shuffled[i * 2 + 1]
    if (!a || !b) break
    matchups.push({
      session_id: sessionId,
      round_number: i + 1,
      option_a_image_url: a.image_url,
      option_a_caption: a.caption,
      option_b_image_url: b.image_url,
      option_b_caption: b.caption,
    })
  }

  if (matchups.length === 0) return { error: 'Could not generate matchups' }

  const { error } = await supabase.from('session_matchups').insert(matchups)
  if (error) return { error: error.message }
  return {}
}

export async function getMatchupsWithVotes(sessionId: string): Promise<{
  matchups: SessionMatchupRow[]
  votes: SessionVoteRow[]
}> {
  const { data: matchups } = await supabase
    .from('session_matchups')
    .select('*')
    .eq('session_id', sessionId)
    .order('round_number', { ascending: true })

  const matchupIds = (matchups ?? []).map((m: SessionMatchupRow) => m.id)

  let votes: SessionVoteRow[] = []
  if (matchupIds.length > 0) {
    const { data: voteData } = await supabase
      .from('session_votes')
      .select('*')
      .in('matchup_id', matchupIds)

    votes = (voteData ?? []) as SessionVoteRow[]
  }

  return { matchups: (matchups ?? []) as SessionMatchupRow[], votes }
}

export async function submitVote(
  matchupId: string,
  userId: string,
  choice: 'a' | 'b'
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('session_votes')
    .insert({ matchup_id: matchupId, user_id: userId, choice })

  if (error) {
    if (error.code === '23505') return {}
    return { error: error.message }
  }
  return {}
}

export async function tallyMatchup(
  matchupId: string,
  sessionId: string
): Promise<{ winner: 'a' | 'b' } | { error: string }> {
  const { data: votes } = await supabase
    .from('session_votes')
    .select('choice')
    .eq('matchup_id', matchupId)

  if (!votes || votes.length === 0) return { error: 'No votes' }

  const aCount = votes.filter((v: { choice: string }) => v.choice === 'a').length
  const bCount = votes.filter((v: { choice: string }) => v.choice === 'b').length
  const winner: 'a' | 'b' = aCount >= bCount ? 'a' : 'b'

  // Host updates the matchup winner -- need to use the session context
  void sessionId
  const { error } = await supabase
    .from('session_matchups')
    .update({ winner })
    .eq('id', matchupId)

  if (error) return { error: error.message }
  return { winner }
}

export async function buildFinalComic(
  sessionId: string,
  hostId: string
): Promise<{ slug: string; comicId: string } | { error: string }> {
  const { data: matchups } = await supabase
    .from('session_matchups')
    .select('*')
    .eq('session_id', sessionId)
    .order('round_number', { ascending: true })

  if (!matchups || matchups.length === 0) return { error: 'No matchups found' }

  const winningFrames = (matchups as SessionMatchupRow[]).map((m) => {
    if (m.winner === 'b') {
      return { image_url: m.option_b_image_url, caption: m.option_b_caption }
    }
    return { image_url: m.option_a_image_url, caption: m.option_a_caption }
  })

  const slug = crypto.randomUUID().slice(0, 8)

  const { data: comicRow, error: comicError } = await supabase
    .from('comics')
    .insert({
      slug,
      owner_id: hostId,
      title: 'Collaborative Comic',
      status: 'complete',
      mode: 'collab',
      session_id: sessionId,
    })
    .select('id')
    .single()

  if (comicError || !comicRow) {
    return { error: comicError?.message ?? 'Failed to create comic' }
  }

  const comicId = (comicRow as { id: string }).id

  const frameRows = winningFrames.map((f, i) => ({
    comic_id: comicId,
    order: i,
    image_url: f.image_url,
    // Same rendering behavior as personal collab comics.
    caption: f.caption,
    overlay_x: 50,
    overlay_y: DEFAULT_OVERLAY_Y,
    font_size: DEFAULT_COMIC_FONT_SIZE,
    font_color: DEFAULT_COMIC_FONT_COLOR,
  }))

  const { error: framesError } = await supabase.from('frames').insert(frameRows)
  if (framesError) return { error: framesError.message }

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ final_comic_id: comicId })
    .eq('id', sessionId)
    .eq('host_id', hostId)

  if (updateError) return { error: updateError.message }

  return { slug, comicId }
}

// ---------------------------------------------------------------------------
// Performance mode helpers
// ---------------------------------------------------------------------------

export async function advancePerformanceRound(
  sessionId: string,
  hostId: string,
  currentRound: SessionRound,
  currentRoundNumber: number,
  _currentSubStep?: SubStep
): Promise<{ error?: string }> {
  void _currentSubStep
  let nextRound: SessionRound
  let nextNumber = currentRoundNumber

  if (currentRound === 'lobby') {
    nextRound = 'contribute'
    nextNumber = 1
  } else if (currentRound === 'contribute' && currentRoundNumber === 1) {
    nextRound = 'contribute'
    nextNumber = 2
  } else if (currentRound === 'contribute' && currentRoundNumber === 2) {
    nextRound = 'contribute'
    nextNumber = 3
  } else if (currentRound === 'contribute' && currentRoundNumber === 3) {
    nextRound = 'present'
  } else if (currentRound === 'present') {
    nextRound = 'complete'
  } else {
    return { error: 'Cannot advance from current round' }
  }

  return advanceRound(sessionId, hostId, nextRound, nextNumber)
}

export async function submitContribution(
  sessionId: string,
  userId: string,
  imageFile: File,
  phrase: string,
  roundNumber: number
): Promise<{ error?: string }> {
  const imgResult = await submitImages(sessionId, userId, [imageFile], roundNumber)
  if (imgResult.error) return imgResult

  const phraseResult = await submitPhrases(sessionId, userId, [phrase], roundNumber)
  if (phraseResult.error) return phraseResult

  return {}
}

export async function getContributionCountForRound(
  sessionId: string,
  roundNumber: number
): Promise<{ imageUsers: Set<string>; phraseUsers: Set<string> }> {
  const { data: imgs } = await supabase
    .from('session_images')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('round_number', roundNumber)

  const { data: phrs } = await supabase
    .from('session_phrases')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('round_number', roundNumber)

  const imageUsers = new Set((imgs ?? []).map((r: { user_id: string }) => r.user_id))
  const phraseUsers = new Set((phrs ?? []).map((r: { user_id: string }) => r.user_id))
  return { imageUsers, phraseUsers }
}

export async function hasUserContributedForRound(
  sessionId: string,
  userId: string,
  roundNumber: number
): Promise<boolean> {
  const { imageUsers, phraseUsers } = await getContributionCountForRound(sessionId, roundNumber)
  return imageUsers.has(userId) && phraseUsers.has(userId)
}

export async function getRandomImageForUser(
  sessionId: string,
  userId: string
): Promise<SessionImageRow | null> {
  const { data } = await supabase
    .from('session_images')
    .select('*')
    .eq('session_id', sessionId)
    .neq('user_id', userId)

  if (!data || data.length === 0) return null
  const idx = Math.floor(Math.random() * data.length)
  return data[idx] as SessionImageRow
}

function hashString(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) >>> 0
  }
  return h
}

function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items]
  let h = hashString(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    h = (Math.imul(1103515245, h) + 12345) >>> 0
    const j = h % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function sharedPhraseCount(phraseCount: number): number {
  if (phraseCount <= 2) return phraseCount
  if (phraseCount <= 4) return 2
  return 3
}

function phraseGroupCount(playerCount: number): number {
  if (playerCount >= 6) return 3
  if (playerCount >= 4) return 2
  return 1
}

/** Performance pairing: shared core phrases + a group-specific slice so piles overlap but differ. */
export function partitionPhrasesForUser(
  phrases: SessionPhraseRow[],
  memberUserIds: string[],
  userId: string,
  sessionId: string
): SessionPhraseRow[] {
  const pool = [...phrases]
    .filter((p) => p.user_id !== userId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  if (pool.length === 0) return []

  const userIndex = memberUserIds.indexOf(userId)
  if (userIndex < 0) return pool

  const sharedCount = sharedPhraseCount(pool.length)
  const shuffled = deterministicShuffle(pool, sessionId)
  const shared = shuffled.slice(0, sharedCount)
  const exclusive = shuffled.slice(sharedCount)

  if (exclusive.length === 0) return shared

  const numGroups = phraseGroupCount(memberUserIds.length)
  const groupIndex = userIndex % numGroups
  const buckets: SessionPhraseRow[][] = Array.from({ length: numGroups }, () => [])
  exclusive.forEach((phrase, i) => {
    buckets[i % numGroups].push(phrase)
  })

  const seen = new Set<string>()
  return [...shared, ...(buckets[groupIndex] ?? [])].filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

export async function getPhrasesForUser(
  sessionId: string,
  userId: string,
  memberUserIds: string[],
  pairingRoundNumber = 2
): Promise<SessionPhraseRow[]> {
  const { data } = await supabase
    .from('session_phrases')
    .select('*')
    .eq('session_id', sessionId)

  const phrases = (data ?? []) as SessionPhraseRow[]
  const forRound = phrases.filter(
    (p) => p.round_number === pairingRoundNumber || p.round_number === null
  )
  const pool = forRound.length > 0 ? forRound : phrases

  return partitionPhrasesForUser(pool, memberUserIds, userId, sessionId)
}

export async function submitPairing(
  sessionId: string,
  userId: string,
  imageUrl: string,
  phraseText: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('session_pairings')
    .insert({ session_id: sessionId, user_id: userId, image_url: imageUrl, phrase_text: phraseText })
  if (error) return { error: error.message }
  return {}
}

export async function getSessionPairings(sessionId: string): Promise<SessionPairingRow[]> {
  const { data } = await supabase
    .from('session_pairings')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SessionPairingRow[]
}

export async function togglePairingFeatured(
  pairingId: string,
  featured: boolean
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('session_pairings')
    .update({ featured })
    .eq('id', pairingId)
  if (error) return { error: error.message }
  return {}
}

export async function getActivePerformanceSession(): Promise<SessionRow | null> {
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('session_type', 'performance')
    .neq('round', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as SessionRow) ?? null
}
