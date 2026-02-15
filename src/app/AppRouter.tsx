import MainAppPage from '../modules/livestream/pages/MainAppPage';
import FramerPreviewPage from '../modules/showcase/pages/FramerPreviewPage';

export default function AppRouter() {
  const path = window.location.pathname;

  if (path.startsWith('/join-room/') || path.startsWith('/host-room/')) {
    return <MainAppPage />;
  }

  return <FramerPreviewPage />;
}
