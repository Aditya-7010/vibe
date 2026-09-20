import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { ApiError } from '../lib/api';
import { AvatarSprite } from '../components/Avatar';
import * as Icon from '../components/Icons';
import { Room } from '../types';

const ROOMS_PER_PAGE = 10;

/**
 * Room cards are wide by design: two or three to a row rather than four, so
 * the art has room to breathe and the description isn't squeezed. The whole
 * card is the button — there's no separate "Enter" control to aim at.
 */
function RoomCard({ room, onEnter, isFav, onFav }: { room: Room; onEnter: () => void; isFav: boolean; onFav: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-2xl overflow-hidden border card-hover cursor-pointer group flex flex-col sm:flex-row"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      onClick={onEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEnter();
        }
      }}
    >
      <div className="relative overflow-hidden flex-shrink-0 sm:w-56" style={{ minHeight: 150 }}>
        <img
          src={room.artUrl}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          style={{ minHeight: 150 }}
        />
        <div className="room-art-overlay absolute inset-0 sm:opacity-60" />
        {room.isActive && (
          <div
            className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#4ade80', backdropFilter: 'blur(4px)' }}
          >
            <span className="live-pulse" style={{ display: 'inline-flex' }}><Icon.Live size={9} /></span>
            {room.memberCount} listening
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col min-w-0">
        <div className="flex items-start gap-3">
          <h3 className="font-bold text-lg truncate flex-1" style={{ fontFamily: 'var(--font-head)' }}>
            {room.name}
          </h3>
          <button
            onClick={(e) => { e.stopPropagation(); onFav(); }}
            className="icon-btn w-9 h-9"
            style={isFav ? { color: 'var(--primary)' } : undefined}
            aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
            title={isFav ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Icon.Heart size={18} filled={isFav} />
          </button>
        </div>

        <p className="text-sm leading-relaxed line-clamp-3 mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
          {room.description || 'No description yet — open it and set the mood.'}
        </p>

        <div className="mt-auto pt-4 flex items-center gap-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          <span className="flex items-center gap-1.5"><Icon.User size={14} /> {room.ownerName}</span>
          {!room.isActive && <span className="flex items-center gap-1.5"><Icon.Music size={14} /> quiet right now</span>}
          <span className="ml-auto flex items-center gap-1 font-semibold" style={{ color: 'var(--primary)' }}>
            Open <Icon.ArrowRight size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}

function CreateRoomModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, desc: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 border" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--elev-2)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-head)' }}>Create a room</h2>
          <button onClick={onClose} className="icon-btn w-9 h-9" aria-label="Close"><Icon.Close size={18} /></button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Room name</label>
            <input className="input-field w-full px-4 py-3 rounded-xl text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Late night listening" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Description</label>
            <textarea className="input-field w-full px-4 py-3 rounded-xl text-sm resize-none" rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's the vibe?" />
          </div>
          <button
            className="btn-primary py-3 rounded-xl font-semibold mt-2"
            disabled={busy || name.trim().length < 3}
            onClick={async () => {
              if (name.trim().length < 3 || busy) return;
              setBusy(true);
              try {
                await onCreate(name.trim(), desc);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Creating…' : 'Create room'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    user, rooms, roomsLoading, loadRooms, theme, toggleTheme, logout,
    favoriteRooms, toggleFavoriteRoom, createRoom, setError,
  } = useStore();
  const [tab, setTab] = useState<'public' | 'favs' | 'mine'>('public');
  const [query, setQuery] = useState('');
  const [activePage, setActivePage] = useState(1);
  const [inactivePage, setInactivePage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [sidebarPos, setSidebarPos] = useState({ x: 16, y: 200 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, sx: 0, sy: 0 });

  // Load once, then poll so the "N listening" badges stay honest.
  useEffect(() => {
    loadRooms();
    const timer = setInterval(() => loadRooms(), 20000);
    return () => clearInterval(timer);
  }, [loadRooms]);

  const needle = query.trim().toLowerCase();
  const filtered = rooms.filter(r => {
    if (tab === 'favs' && !favoriteRooms.includes(r.id)) return false;
    if (tab === 'mine' && r.ownerId !== user?.id) return false;
    if (needle && !`${r.name} ${r.description}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const active = filtered.filter(r => r.isActive);
  const inactive = filtered.filter(r => !r.isActive);

  const activePages = Math.ceil(active.length / ROOMS_PER_PAGE);
  const inactivePages = Math.ceil(inactive.length / ROOMS_PER_PAGE);

  const pagedActive = active.slice((activePage - 1) * ROOMS_PER_PAGE, activePage * ROOMS_PER_PAGE);
  const pagedInactive = inactive.slice((inactivePage - 1) * ROOMS_PER_PAGE, inactivePage * ROOMS_PER_PAGE);

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    setDragging(true);
    const point = 'touches' in e ? e.touches[0] : e;
    dragStart.current = { x: point.clientX, y: point.clientY, sx: sidebarPos.x, sy: sidebarPos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      const point = 'touches' in e ? e.touches[0] : e as MouseEvent;
      const dx = point.clientX - dragStart.current.x;
      const dy = point.clientY - dragStart.current.y;
      setSidebarPos({ x: Math.max(0, dragStart.current.sx + dx), y: Math.max(0, dragStart.current.sy + dy) });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove as any, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging]);

  const handleCreateRoom = async (name: string, desc: string) => {
    try {
      const room = await createRoom(name, desc);
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that room.');
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/');
  };

  const ThemeGlyph = theme === 'dark' ? Icon.Moon : theme === 'light' ? Icon.Sun : Icon.Layers;

  function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-2 mt-8">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="icon-btn w-9 h-9 border"
          style={{ borderColor: 'var(--border)' }}
          aria-label="Previous page"
        >
          <Icon.ArrowLeft size={16} />
        </button>
        {Array.from({ length: total }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className="w-9 h-9 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: p === page ? 'var(--primary)' : 'var(--secondary)',
              color: p === page ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: `1px solid ${p === page ? 'transparent' : 'var(--border)'}`,
            }}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPage(Math.min(total, page + 1))}
          disabled={page === total}
          className="icon-btn w-9 h-9 border"
          style={{ borderColor: 'var(--border)' }}
          aria-label="Next page"
        >
          <Icon.ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-transition" style={{ background: 'var(--background)' }}>
      {/* Draggable sidebar */}
      <div
        className="draggable-sidebar select-none"
        style={{ left: sidebarPos.x, top: sidebarPos.y, cursor: dragging ? 'grabbing' : 'default' }}
      >
        <div
          className="rounded-2xl border flex flex-col gap-1 p-2"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--elev-2)', width: 60 }}
        >
          <div
            className="flex items-center justify-center h-6 rounded-lg mb-1 cursor-grab"
            style={{ color: 'var(--muted-foreground)' }}
            onMouseDown={startDrag}
            onTouchStart={startDrag}
            title="Drag to move"
          >
            <Icon.Grip size={16} />
          </div>

          <button
            onClick={() => navigate('/profile')}
            className="flex items-center justify-center w-full rounded-xl py-2"
            style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}
            title="Profile"
          >
            {user ? <AvatarSprite skin={user.avatarSkin} size={34} faceOnly /> : <Icon.User size={20} />}
          </button>

          <SidebarBtn Glyph={Icon.Settings} label="Settings" onClick={() => navigate('/settings')} />
          <SidebarBtn Glyph={Icon.Users} label="Friends" onClick={() => navigate('/profile')} />
          <div className="h-px my-1" style={{ background: 'var(--border)' }} />
          <SidebarBtn Glyph={Icon.Exit} label="Sign out" onClick={handleSignOut} />
        </div>
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b"
        style={{ background: 'color-mix(in srgb, var(--background) 88%, transparent)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}
      >
        {/* The logo goes home to the dashboard — it used to drop you on the
            marketing page, which read as being signed out. */}
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <Icon.Logo size={28} />
          <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-head)' }}>vibe</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button onClick={toggleTheme} className="icon-btn w-10 h-10 border" style={{ borderColor: 'var(--border)' }} title={`Theme: ${theme}`}>
            <ThemeGlyph size={17} />
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
          >
            <AvatarSprite skin={user?.avatarSkin || 0} size={26} faceOnly />
            {user?.username}
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--secondary)' }}>
            {([
              { id: 'public' as const, label: 'All rooms' },
              { id: 'favs' as const, label: 'Favourites' },
              { id: 'mine' as const, label: 'My rooms' },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setActivePage(1); setInactivePage(1); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: tab === t.id ? 'var(--primary)' : 'transparent',
                  color: tab === t.id ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-1 justify-end min-w-[260px]">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }}>
                <Icon.Search size={16} />
              </span>
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setActivePage(1); setInactivePage(1); }}
                placeholder="Search rooms"
                className="input-field w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
              />
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold">
              <Icon.Plus size={16} /> Create room
            </button>
          </div>
        </div>

        {pagedActive.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-5" style={{ color: '#4ade80' }}>
              <Icon.Live size={10} />
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-head)', color: 'var(--foreground)' }}>Active rooms</h2>
              <span className="text-sm px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.12)' }}>{active.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              {pagedActive.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onEnter={() => navigate(`/room/${room.id}`)}
                  isFav={favoriteRooms.includes(room.id)}
                  onFav={() => toggleFavoriteRoom(room.id)}
                />
              ))}
            </div>
            <Pagination page={activePage} total={activePages} onPage={setActivePage} />
          </>
        )}

        {pagedInactive.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-5" style={{ color: 'var(--muted-foreground)' }}>
              <Icon.Music size={15} />
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-head)', color: 'var(--foreground)' }}>Quiet rooms</h2>
              <span className="text-sm px-2 py-0.5 rounded-full" style={{ background: 'var(--secondary)' }}>{inactive.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6" style={{ opacity: 0.72 }}>
              {pagedInactive.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onEnter={() => navigate(`/room/${room.id}`)}
                  isFav={favoriteRooms.includes(room.id)}
                  onFav={() => toggleFavoriteRoom(room.id)}
                />
              ))}
            </div>
            <Pagination page={inactivePage} total={inactivePages} onPage={setInactivePage} />
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3" style={{ color: 'var(--muted-foreground)' }}>
            <span className={roomsLoading ? 'spin-slow' : ''} style={{ color: 'var(--primary)' }}>
              <Icon.Disc size={34} />
            </span>
            {roomsLoading ? (
              <p className="text-sm">Loading rooms…</p>
            ) : (
              <>
                <p className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>No rooms here</p>
                <p className="text-sm">
                  {tab === 'favs'
                    ? 'Favourite a room and it shows up here.'
                    : tab === 'mine'
                      ? 'Create your first room.'
                      : 'Nothing matched that search.'}
                </p>
              </>
            )}
          </div>
        )}
      </main>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreate={handleCreateRoom} />}
    </div>
  );
}

function SidebarBtn({ Glyph, label, onClick }: { Glyph: React.FC<any>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="icon-btn w-full py-2.5" title={label} aria-label={label}>
      <Glyph size={19} />
    </button>
  );
}
