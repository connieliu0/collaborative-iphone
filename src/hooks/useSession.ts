import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchSession, type SessionRow, type SessionMemberRow } from '../lib/session'

export interface UseSessionResult {
  session: SessionRow | null
  members: SessionMemberRow[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useSession(code: string | undefined): UseSessionResult {
  const [session, setSession] = useState<SessionRow | null>(null)
  const [members, setMembers] = useState<SessionMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!code) {
      setLoading(false)
      setError('No session code')
      return
    }
    setLoading(true)
    setError(null)
    const result = await fetchSession(code)
    if ('error' in result) {
      setError(result.error)
      setSession(null)
      setMembers([])
    } else {
      setSession(result.session)
      setMembers(result.members)
    }
    setLoading(false)
  }, [code])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!session?.id) return

    const channel = supabase
      .channel(`session-sync-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const updated = payload.new as SessionRow
          setSession((prev) => (prev ? { ...prev, ...updated } : updated))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_members',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          load()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'session_members',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          load()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.id, load])

  return { session, members, loading, error, refetch: load }
}
