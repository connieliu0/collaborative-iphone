import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/** `/` sends everyone into the create flow; logged-in users always land on `/create`. */
export function LandingPage() {
  const { loading } = useAuth()

  if (loading) {
    return null
  }

  return <Navigate to="/create" replace />
}
