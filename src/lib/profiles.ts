import { supabase } from './supabase'

// TODO — Schema: profiles table (create if not exists): id uuid (matches auth.users.id), username text unique
export interface ProfileRow {
  id: string
  username: string
}

export async function getProfileByUsername(
  username: string
): Promise<ProfileRow | null> {
  const normalized = username.trim().toLowerCase()
  if (!normalized) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', normalized)
    .maybeSingle()
  if (error || !data) return null
  return data as ProfileRow
}

export async function getProfilesByIds(ids: string[]): Promise<ProfileRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', ids)
  if (error || !data) return []
  return data as ProfileRow[]
}

export async function updateMyUsername(
  userId: string,
  username: string
): Promise<{ success: true } | { error: string }> {
  const next = username.trim()
  if (!next) return { error: 'Name is required' }

  const { error } = await supabase
    .from('profiles')
    .update({ username: next })
    .eq('id', userId)

  if (error) return { error: error.message }
  return { success: true }
}
