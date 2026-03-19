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
import { LobbyPage } from './pages/session/LobbyPage'
import { ImagesRoundPage } from './pages/session/ImagesRoundPage'
import { PhrasesRoundPage } from './pages/session/PhrasesRoundPage'
import { ComposeRoundPage } from './pages/session/ComposeRoundPage'
import { VotingRoundPage } from './pages/session/VotingRoundPage'
import { ResultsPage } from './pages/session/ResultsPage'
import { VisualizerPage } from './pages/session/VisualizerPage'

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

          {/* Session / Collab Mode */}
          <Route path="/session/:code" element={<LobbyPage />} />
          <Route path="/session/:code/images" element={<ImagesRoundPage />} />
          <Route path="/session/:code/phrases" element={<PhrasesRoundPage />} />
          <Route path="/session/:code/compose" element={<ComposeRoundPage />} />
          <Route path="/session/:code/voting" element={<VotingRoundPage />} />
          <Route path="/session/:code/results" element={<ResultsPage />} />
          {/* Back-compat: some clients may navigate to /complete instead of /results */}
          <Route path="/session/:code/complete" element={<ResultsPage />} />
          <Route path="/session/:code/visualizer" element={<VisualizerPage />} />
        </Routes>
      </Layout>
    </AuthModalProvider>
  )
}
