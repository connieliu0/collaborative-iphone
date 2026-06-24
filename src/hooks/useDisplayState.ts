import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchDisplayState, type DisplayState } from '../lib/gallery'

export function useDisplayState() {
  const [state, setState] = useState<DisplayState | null>(null)

  const reload = useCallback(async () => {
    const data = await fetchDisplayState()
    setState(data)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const channel = supabase
      .channel('display-state-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'display_state' },
        (payload) => {
          setState(payload.new as DisplayState)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  return { state, reload }
}
