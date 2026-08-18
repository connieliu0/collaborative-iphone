import { Routes, Route } from 'react-router-dom'
import { AuthModalProvider } from './contexts/AuthModalContext'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LandingPage } from './pages/LandingPage'
import { CreatePage } from './pages/CreatePage'
import { EditPage } from './pages/EditPage'
import { PreviewPage } from './pages/PreviewPage'
import { ComicViewerPage } from './pages/ComicViewerPage'
import { AddFramePage } from './pages/AddFramePage'
import { PublishPage } from './pages/PublishPage'
import { ProfilePage } from './pages/ProfilePage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { LobbyPage } from './pages/session/LobbyPage'
import { ImagesRoundPage } from './pages/session/ImagesRoundPage'
import { PhrasesRoundPage } from './pages/session/PhrasesRoundPage'
import { ComposeRoundPage } from './pages/session/ComposeRoundPage'
import { VotingRoundPage } from './pages/session/VotingRoundPage'
import { ResultsPage } from './pages/session/ResultsPage'
import { VisualizerPage } from './pages/session/VisualizerPage'
import { ContributeRoundPage } from './pages/session/ContributeRoundPage'
import { PairRoundPage } from './pages/session/PairRoundPage'
import { AdminPage } from './pages/session/AdminPage'
import { GalleryDisplayPage } from './pages/gallery/GalleryDisplayPage'
import { GalleryUploadPage } from './pages/gallery/GalleryUploadPage'
import { GalleryResultPage } from './pages/gallery/GalleryResultPage'
import { SessionEntryPage } from './pages/session/SessionEntryPage'

export function App() {
  return (
    <AuthModalProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<LandingPage />} />
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
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Hidden session entry points — not linked from the home page */}
          <Route path="/host" element={<SessionEntryPage mode="host" />} />
          <Route path="/performance" element={<SessionEntryPage mode="performance" />} />
          <Route path="/join" element={<SessionEntryPage mode="join" />} />

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

          {/* Performance Mode */}
          <Route path="/session/:code/contribute" element={<ContributeRoundPage />} />
          <Route path="/session/:code/pair" element={<PairRoundPage />} />
          <Route path="/session/:code/admin" element={<AdminPage />} />

          {/* Session-agnostic UI test routes */}
          <Route path="/ui-test/session/contribute/1" element={<ContributeRoundPage mockRoundNumber={1} />} />
          <Route path="/ui-test/session/contribute/2" element={<ContributeRoundPage mockRoundNumber={2} />} />
          <Route path="/ui-test/session/contribute/3" element={<ContributeRoundPage mockRoundNumber={3} />} />

          {/* Gallery Print routes */}
          <Route path="/gallery/display" element={<GalleryDisplayPage />} />
          <Route path="/gallery/upload" element={<GalleryUploadPage />} />
          <Route path="/gallery/result/:id" element={<GalleryResultPage />} />
        </Routes>
      </Layout>
    </AuthModalProvider>
  )
}
