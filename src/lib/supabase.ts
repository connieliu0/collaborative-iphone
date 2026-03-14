import { createClient } from '@supabase/supabase-js'

/*
 * TODO — RLS policies to configure in Supabase:
 *
 * comics:
 *   - owner (owner_id = auth.uid()) can insert
 *   - collaborators can update (e.g. turn_order) when owner; collaborators can insert frames when it's their turn (current_turn_user_id = auth.uid())
 *   - public can read completed comics (status = 'complete'); participants can read in_progress
 *
 * frames:
 *   - owner or current-turn user can insert when comic.current_turn_user_id = auth.uid()
 *   - public can read (select)
 *
 * profiles (create if not exists): id uuid (matches auth.users.id), username text unique
 *   - users can read profiles (for invite lookup); users can update own profile
 *
 * storage bucket "comic-frames":
 *   - owner can upload (user_id folder = auth.uid())
 *   - public can read
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
