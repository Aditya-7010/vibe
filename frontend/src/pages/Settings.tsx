import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { AvatarSprite } from '../components/Avatar';
import * as Icon from '../components/Icons';
import { ACCENTS, THEMES, applyAppearance } from '../lib/appearance';
import { ApiError } from '../lib/api';
import { LikeEffect, Theme } from '../types';

const THEME_GLYPH: Record<Theme, React.FC<any>> = {
  dark: Icon.Moon,
  light: Icon.Sun,
  skeu: Icon.Layers,
};

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme, user, updateProfile, setBubblesEnabled, setError } = useStore();
  const [fontSize, setFontSize] = useState(user?.fontSize || 'medium');
  const [accentColor, setAccentColor] = useState(user?.accentColor || 'purple');
  const [animationsEnabled, setAnimationsEnabled] = useState(user?.animationsEnabled ?? true);
  const [bubbleChat, setBubbleChat] = useState(user?.bubbleChatEnabled ?? true);
  const [likeEffect, setLikeEffect] = useState<LikeEffect>(user?.likeEffect || 'happy');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFontSize(user.fontSize || 'medium');
    setAccentColor(user.accentColor || 'purple');
    setAnimationsEnabled(user.animationsEnabled ?? true);
    setBubbleChat(user.bubbleChatEnabled ?? true);
    setLikeEffect(user.likeEffect || 'happy');
  }, [user?.id]);

  // Live preview: the page changes as you click, saving makes it stick.
  useEffect(() => {
    applyAppearance({ accentColor, fontSize, animationsEnabled, theme });
  }, [accentColor, fontSize, animationsEnabled, theme]);

  const accentList = Object.entries(ACCENTS).map(([id, value]) => ({
    id,
    label: value.label,
    color: value[theme] || value.dark,
  }));

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateProfile({
        likeEffect,
        accentColor,
        fontSize,
        animationsEnabled,
        bubbleChatEnabled: bubbleChat,
      });
      setBubblesEnabled(bubbleChat);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen page-transition" style={{ background: 'var(--background)' }}>
      <header
        className="sticky top-0 z-10 flex items-center gap-4 px-6 py-4 border-b"
        style={{ background: 'color-mix(in srgb, var(--background) 88%, transparent)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}
      >
        <button onClick={() => navigate('/dashboard')} className="btn-ghost px-3 py-2 rounded-xl text-sm">
          <Icon.ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-head)' }}>Settings</h1>
        <button onClick={() => navigate('/profile')} className="btn-ghost px-3 py-2 rounded-xl text-sm ml-auto">
          Profile <Icon.ArrowRight size={15} />
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
        <Section title="Appearance" Glyph={Icon.Palette}>
          <div className="py-2">
            <p className="text-sm font-semibold mb-1">Theme</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>
              Applies everywhere and follows you to other devices.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {THEMES.map(t => {
                const Glyph = THEME_GLYPH[t.id];
                const on = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all"
                    style={{
                      background: on ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--secondary)',
                      border: `2px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    <span style={{ color: on ? 'var(--primary)' : 'var(--muted-foreground)' }}><Glyph size={20} /></span>
                    <span className="text-sm font-semibold">{t.label}</span>
                    <span className="text-xs leading-snug" style={{ color: 'var(--muted-foreground)' }}>{t.blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px my-3" style={{ background: 'var(--border)' }} />

          <div className="py-2">
            <p className="text-sm font-semibold mb-3">Accent colour</p>
            <div className="flex flex-wrap gap-2.5">
              {accentList.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAccentColor(a.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: accentColor === a.id ? `${a.color}22` : 'var(--secondary)',
                    border: `2px solid ${accentColor === a.id ? a.color : 'var(--border)'}`,
                    color: accentColor === a.id ? a.color : 'var(--muted-foreground)',
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: a.color, display: 'inline-block', flexShrink: 0 }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px my-3" style={{ background: 'var(--border)' }} />

          <div className="py-2">
            <p className="text-sm font-semibold mb-3">Text size</p>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize"
                  style={{
                    background: fontSize === s ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--secondary)',
                    border: `2px solid ${fontSize === s ? 'var(--primary)' : 'var(--border)'}`,
                    color: fontSize === s ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Accessibility" Glyph={Icon.Accessibility}>
          <Toggle
            label="Animations"
            desc="Avatar movement, transitions and other motion"
            value={animationsEnabled}
            onChange={setAnimationsEnabled}
          />
          <div className="h-px my-2" style={{ background: 'var(--border)' }} />
          <Toggle
            label="Bubble chat"
            desc="Show chat messages as speech bubbles over avatars in the room"
            value={bubbleChat}
            onChange={setBubbleChat}
          />
        </Section>

        <Section title="Room behaviour" Glyph={Icon.Music}>
          <div className="py-2">
            <p className="text-sm font-semibold mb-1">Like reaction</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>
              What your avatar does when you like the track
            </p>
            <div className="flex gap-3 flex-wrap">
              {([
                { key: 'happy' as const, label: 'Happy', Glyph: Icon.Smile },
                { key: 'surprised' as const, label: 'Surprised', Glyph: Icon.Star },
                { key: 'bop' as const, label: 'Head bop', Glyph: Icon.Music },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setLikeEffect(opt.key)}
                  className="flex flex-col items-center gap-2 px-5 py-3.5 rounded-xl transition-all"
                  style={{
                    background: likeEffect === opt.key ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--secondary)',
                    border: `2px solid ${likeEffect === opt.key ? 'var(--primary)' : 'var(--border)'}`,
                    color: likeEffect === opt.key ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  <opt.Glyph size={20} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px my-3" style={{ background: 'var(--border)' }} />

          <div className="flex items-end justify-between py-2 gap-4">
            <div>
              <p className="text-sm font-semibold">Preview</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>How your avatar reacts</p>
            </div>
            {user && (
              <div className="flex gap-8 items-end">
                <div className="text-center">
                  <AvatarSprite
                    skin={user.avatarSkin}
                    size={96}
                    expression={likeEffect === 'bop' ? 'happy' : likeEffect}
                    showBop={likeEffect === 'bop'}
                  />
                  <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>on like</p>
                </div>
                <div className="text-center">
                  <AvatarSprite skin={user.avatarSkin} size={96} expression="neutral" />
                  <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>normal</p>
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section title="About" Glyph={Icon.Info}>
          <div className="py-2 flex flex-col gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {[
              ['Version', '1.1.0'],
              ['Backend', 'Django + Channels'],
              ['Sync protocol', 'WebSocket'],
              ['Video', 'YouTube embed'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <span style={{ color: 'var(--foreground)', fontFamily: k === 'Version' ? 'var(--font-code)' : undefined }}>{v}</span>
              </div>
            ))}
          </div>
        </Section>

        <button onClick={handleSave} disabled={busy} className="btn-primary py-3.5 rounded-2xl font-semibold text-base">
          {busy ? 'Saving…' : saved ? <><Icon.Check size={17} /> Saved</> : 'Save settings'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, Glyph, children }: { title: string; Glyph: React.FC<any>; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--elev-1)' }}>
      <div className="flex items-center gap-2.5 mb-5" style={{ color: 'var(--primary)' }}>
        <Glyph size={18} />
        <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-head)', color: 'var(--foreground)' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 gap-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={label}
        className="relative flex-shrink-0 transition-colors"
        style={{ width: 46, height: 26, borderRadius: 13, background: value ? 'var(--primary)' : 'var(--muted)', border: '1px solid var(--border)' }}
      >
        <span
          className="absolute transition-transform"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            top: 3,
            left: 3,
            transform: value ? 'translateX(20px)' : 'translateX(0)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
          }}
        />
      </button>
    </div>
  );
}
