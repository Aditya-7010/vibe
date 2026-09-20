import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarSprite } from '../components/Avatar';
import * as Icon from '../components/Icons';
import { useStore } from '../store';

const FEATURES = [
  {
    Glyph: Icon.Sync,
    title: 'Perfectly synced',
    desc: 'The server owns the clock. Everyone hears the same second of the same song, whenever they walked in — and pausing on your end never drags the room off.',
  },
  {
    Glyph: Icon.Deck,
    title: 'Take a turn on the decks',
    desc: 'Join the DJ line and the room plays from your queue when your turn comes round. The owner can reshuffle the line or drop someone out of it.',
  },
  {
    Glyph: Icon.Chat,
    title: 'Bubble chat',
    desc: 'What you type floats over your avatar for a few seconds. Short, expressive, and easier to follow than a wall of text.',
  },
  {
    Glyph: Icon.QueueList,
    title: 'Collaborative queue',
    desc: 'Search YouTube straight from the panel, add without pressing enter, drag to reorder. No keys, no setup.',
  },
  {
    Glyph: Icon.Heart,
    title: 'React together',
    desc: 'Like a track and your avatar goes happy, surprised or head-bopping — you pick which one in settings.',
  },
  {
    Glyph: Icon.Palette,
    title: 'Three themes',
    desc: 'Dark for the night, light for the day, and a skeuomorphic mode with real buttons and warm brushed panels.',
  },
];

const PREVIEW = [
  { skin: 2, name: 'wave_rider', bubble: 'this track goes hard', expr: 'happy' as const },
  { skin: 5, name: 'pixel_jam', bubble: null, expr: 'neutral' as const },
  { skin: 0, name: 'you', bubble: 'queue me next', expr: 'happy' as const },
  { skin: 7, name: 'neon_drift', bubble: null, expr: 'surprised' as const },
];

export default function Landing() {
  const navigate = useNavigate();
  const { theme, toggleTheme, isLoggedIn, user } = useStore();

  const ThemeGlyph = theme === 'dark' ? Icon.Moon : theme === 'light' ? Icon.Sun : Icon.Layers;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--background)' }}>
      <div className="hero-glow absolute inset-0 pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <Icon.Logo size={30} />
          <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-head)', color: 'var(--foreground)' }}>vibe</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={toggleTheme} className="btn-ghost px-3 py-2 rounded-xl" title={`Theme: ${theme}`}>
            <ThemeGlyph size={17} />
          </button>
          {isLoggedIn ? (
            <button onClick={() => navigate('/dashboard')} className="btn-primary px-4 py-2 rounded-xl text-sm">
              {user ? `Back to rooms` : 'Open dashboard'} <Icon.ArrowRight size={15} />
            </button>
          ) : (
            <>
              <button onClick={() => navigate('/auth')} className="btn-ghost px-4 py-2 rounded-xl text-sm font-medium">
                Log in
              </button>
              <button onClick={() => navigate('/auth?tab=register')} className="btn-primary px-4 py-2 rounded-xl text-sm">
                Sign up free
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-20">
        <div
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-7"
          style={{
            background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
            color: 'var(--primary)',
          }}
        >
          <span className="live-pulse" style={{ display: 'inline-flex' }}><Icon.Live size={9} /></span>
          Synchronized listening rooms
        </div>

        <h1
          className="text-5xl md:text-7xl font-extrabold mb-6 leading-[1.04] tracking-tight"
          style={{ fontFamily: 'var(--font-head)' }}
        >
          Music is better <span className="gradient-text">together</span>
        </h1>

        <p className="text-lg md:text-xl max-w-2xl mb-10" style={{ color: 'var(--muted-foreground)', lineHeight: 1.65 }}>
          Open a room, share the link, and listen in perfect sync. Take turns on the decks,
          build the queue from YouTube, and react as a crowd instead of a group chat.
        </p>

        <div className="flex flex-wrap gap-3.5 justify-center">
          <button
            onClick={() => navigate(isLoggedIn ? '/dashboard' : '/auth?tab=register')}
            className="btn-primary px-8 py-3.5 rounded-2xl text-base font-semibold"
          >
            {isLoggedIn ? 'Open a room' : 'Create a room'} <Icon.ArrowRight size={17} />
          </button>
          <button
            onClick={() => navigate(isLoggedIn ? '/dashboard' : '/auth')}
            className="btn-ghost px-8 py-3.5 rounded-2xl text-base font-medium"
          >
            Browse public rooms
          </button>
        </div>
      </section>

      {/* Preview */}
      <section className="relative z-10 px-6 pb-24 flex justify-center">
        <div
          className="w-full max-w-4xl rounded-3xl overflow-hidden border"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', boxShadow: 'var(--elev-2)' }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}>
            <div className="flex items-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
              <Icon.Headphones size={16} />
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Synthwave Dreams</span>
            </div>
            <div className="text-xs hidden sm:block" style={{ fontFamily: 'var(--font-code)', color: 'var(--muted-foreground)' }}>
              now playing · 2:14 / 4:05
            </div>
            <div className="flex items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
              <Icon.Volume size={16} />
              <Icon.Sync size={16} />
            </div>
          </div>

          <div className="room-stage relative px-6 pt-10 pb-8">
            <div className="relative z-10 flex items-end justify-center gap-6 md:gap-12 flex-wrap">
              {PREVIEW.map((a, i) => (
                <div key={a.name} className="stage-avatar" style={{ animation: `float 4s ease-in-out ${i * 0.5}s infinite` }}>
                  {a.bubble && <div className="speech-bubble">{a.bubble}</div>}
                  <AvatarSprite skin={a.skin} size={110} expression={a.expr} />
                  <div className="mt-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
                    {a.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 px-4 py-3 border-t flex-wrap" style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}>
            {[
              { Glyph: Icon.Heart, label: 'Like' },
              { Glyph: Icon.ThumbDown, label: 'Dislike' },
              { Glyph: Icon.Bookmark, label: 'Save' },
              { Glyph: Icon.Chat, label: 'Chat' },
              { Glyph: Icon.QueueList, label: 'Queue' },
              { Glyph: Icon.Exit, label: 'Leave' },
            ].map(({ Glyph, label }) => (
              <span key={label} className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-medium">
                <Glyph size={14} /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12" style={{ fontFamily: 'var(--font-head)' }}>
            Everything you need to vibe
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ Glyph, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl border card-hover" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
                >
                  <Glyph size={21} />
                </div>
                <div className="font-bold mb-2" style={{ fontFamily: 'var(--font-head)' }}>{title}</div>
                <div className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 pb-24">
        <div
          className="max-w-2xl mx-auto text-center p-12 rounded-3xl"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 16%, transparent) 0%, color-mix(in srgb, var(--accent) 10%, transparent) 100%)',
            border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
          }}
        >
          <h2 className="text-4xl font-extrabold mb-4" style={{ fontFamily: 'var(--font-head)' }}>Ready to vibe?</h2>
          <p className="mb-8" style={{ color: 'var(--muted-foreground)' }}>Free forever. No credit card. Just music.</p>
          <button
            onClick={() => navigate(isLoggedIn ? '/dashboard' : '/auth?tab=register')}
            className="btn-primary px-10 py-4 rounded-2xl text-lg font-bold"
          >
            {isLoggedIn ? 'Go to your rooms' : 'Join vibe'} <Icon.ArrowRight size={18} />
          </button>
        </div>
      </section>

      <footer className="relative z-10 border-t px-6 py-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Icon.Logo size={20} />
          <span className="font-bold" style={{ fontFamily: 'var(--font-head)', color: 'var(--foreground)' }}>vibe</span>
        </div>
        <p>Music is better together. Always free.</p>
      </footer>
    </div>
  );
}
