import { createContext, useCallback, useContext, useState } from 'react'
import { AuthModal } from '../components/AuthModal'

interface AuthModalContextValue {
  openAuthModal: (message?: string) => void
  closeAuthModal: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)

  const openAuthModal = useCallback((msg?: string) => {
    setMessage(msg)
    setIsOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => {
    setIsOpen(false)
    setMessage(undefined)
  }, [])

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      <AuthModal
        isOpen={isOpen}
        onClose={closeAuthModal}
        message={message}
      />
    </AuthModalContext.Provider>
  )
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext)
  if (!ctx) {
    throw new Error('useAuthModal must be used within AuthModalProvider')
  }
  return ctx
}
