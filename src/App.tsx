import FramerPreviewPage from './pages/FramerPreviewPage';
import MainAppPage from './pages/MainAppPage';

export default function App() {
  const path = window.location.pathname;

  if (path.startsWith('/join-room/') || path.startsWith('/host-room/')) {
    return <MainAppPage />;
  }

  return <FramerPreviewPage />;
}
