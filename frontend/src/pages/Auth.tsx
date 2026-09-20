import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { AvatarSprite } from '../components/Avatar';
import * as Icon from '../components/Icons';
import { ApiError } from '../lib/api';

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation() as { state?: { from?: string } };
  const { login, register, isLoggedIn, theme, toggleTheme } = useStore();
  const redirectTo = location.state?.from || '/dashboard';
  const [tab, setTab] = useState<'login' | 'register'>(
    params.get('tab') === 'register' ? 'register' : 'login'
  );
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn) navigate(redirectTo, { replace: true });
  }, [isLoggedIn, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (tab === 'register') {
      if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
      if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    } else if (!username || !password) {
      setError('Fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'register') {
        await register(username.trim(), email.trim(), password);
      } else {
        await login(username.trim(), password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(124,58,237,0.15) 0%, rgba(6,182,212,0.05) 100%)', borderRight: '1px solid var(--border)' }}>
        <div className="hero-glow absolute inset-0 pointer-events-none" />
        <div className="relative z-10">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Icon.Logo size={32} />
            <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-head)' }}>vibe</span>
          </button>
        </div>
        <div className="relative z-10">
          <blockquote className="text-2xl font-bold leading-snug mb-4" style={{ fontFamily: 'var(--font-head)' }}>
            "Music brings people together.<br />
            <span className="gradient-text">vibe</span> makes it real."
          </blockquote>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Join thousands of listeners sharing music in real-time.</p>
        </div>
        <div className="relative z-10 flex items-end gap-2">
          {[0, 2, 4, 6, 1].map((skin, i) => (
            <div key={skin} style={{ animation: `float 4s ease-in-out ${i * 0.4}s infinite` }}>
              <AvatarSprite skin={skin} size={92} />
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <button onClick={() => navigate('/')} className="flex lg:hidden items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <Icon.Logo size={28} />
            <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-head)' }}>vibe</span>
          </button>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-black" style={{ fontFamily: 'var(--font-head)' }}>
              {tab === 'login' ? 'Welcome back' : 'Join vibe'}
            </h1>
            <button onClick={toggleTheme} className="btn-ghost p-2.5 rounded-xl" title={`Theme: ${theme}`}>
            {theme === 'dark' ? <Icon.Moon size={17} /> : theme === 'light' ? <Icon.Sun size={17} /> : <Icon.Layers size={17} />}
          </button>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl p-1 mb-8" style={{ background: 'var(--secondary)' }}>
            {(['login', 'register'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: tab === t ? 'var(--primary)' : 'transparent',
                  color: tab === t ? 'white' : 'var(--muted-foreground)',
                }}
              >
                {t === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your_username"
                className="input-field w-full px-4 py-3 rounded-xl text-sm"
                autoComplete="username"
              />
            </div>

            {tab === 'register' && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-field w-full px-4 py-3 rounded-xl text-sm"
                  autoComplete="email"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field w-full px-4 py-3 rounded-xl text-sm"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {tab === 'register' && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field w-full px-4 py-3 rounded-xl text-sm"
                  autoComplete="new-password"
                />
              </div>
            )}

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary py-3 rounded-xl font-semibold mt-2"
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Loading…' : tab === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          {tab === 'login' && (
            <p className="text-center text-sm mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Don't have an account?{' '}
              <button onClick={() => setTab('register')} className="font-semibold hover:underline" style={{ color: 'var(--primary)' }}>
                Sign up free
              </button>
            </p>
          )}

          {tab === 'register' && (
            <p className="text-center text-sm mt-4" style={{ color: 'var(--muted-foreground)' }}>
              Already have an account?{' '}
              <button onClick={() => setTab('login')} className="font-semibold hover:underline" style={{ color: 'var(--primary)' }}>
                Log in
              </button>
            </p>
          )}

          <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-foreground)' }}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
