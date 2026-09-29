import { Component, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store';
import { applyThemeClass } from './lib/appearance';
import * as Icon from './components/Icons';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Room from './pages/Room';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

function Splash() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      <div className="flex flex-col items-center gap-3">
        <span className="spin-slow" style={{ color: 'var(--primary)' }}>
          <Icon.Disc size={36} />
        </span>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Tuning in…
        </p>
      </div>
    </div>
  );
}

/**
 * Catches render crashes anywhere below it. Without this, a single thrown
 * error unmounts the whole React tree and the user just sees a blank page
 * with nothing in the UI to tell them what happened.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6"
          style={{ background: 'var(--background)' }}
        >
          <p className="text-lg font-bold">Something went wrong.</p>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary px-5 py-2.5 rounded-xl font-semibold text-sm"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Sends signed-out visitors to /auth, remembering where they were headed. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, booting } = useStore();
  const location = useLocation();
  if (booting) return <Splash />;
  if (!isLoggedIn) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

function ErrorToast() {
  const { error, setError } = useStore();
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error, setError]);

  if (!error) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl text-sm font-medium"
      style={{
        background: 'rgba(239,68,68,0.12)',
        color: '#f87171',
        border: '1px solid rgba(239,68,68,0.25)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={() => setError(null)}
    >
      {error}
    </div>
  );
}

export default function App() {
  const { theme, bootstrap } = useStore();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <ErrorToast />
      <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/room/:id"
          element={
            <RequireAuth>
              <Room />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
