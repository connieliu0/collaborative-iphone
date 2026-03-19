import { Routes, Route } from 'react-router-dom'
import { AuthModalProvider } from './contexts/AuthModalContext'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HomePage } from './pages/HomePage'
import { CreatePage } from './pages/CreatePage'
import { EditPage } from './pages/EditPage'
import { PreviewPage } from './pages/PreviewPage'
import { ComicViewerPage } from './pages/ComicViewerPage'
import { AddFramePage } from './pages/AddFramePage'
import { PublishPage } from './pages/PublishPage'
import { ProfilePage } from './pages/ProfilePage'

export function App() {
  return (
    <AuthModalProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route
            path="/edit"
            element={
              <ErrorBoundary>
                <EditPage />
              </ErrorBoundary>
            }
          />
          <Route path="/preview" element={<PreviewPage />} />
          <Route
            path="/comic/:id/add"
            element={
              <ErrorBoundary>
                <AddFramePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/comic/:id"
            element={
              <ErrorBoundary>
                <ComicViewerPage />
              </ErrorBoundary>
            }
          />
          <Route path="/publish" element={<PublishPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </Layout>
    </AuthModalProvider>
  )
}
