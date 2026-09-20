import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { AvatarSprite } from '../components/Avatar';
import * as Icon from '../components/Icons';
import { searchApi } from '../lib/api';
import { GifResult, SearchResult } from '../types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Emoji here are message reactions — user content, not interface decoration. */
const REACTIONS = ['❤️', '😂', '😮', '👍', '🔥', '💯'];

/** How far out of step with the server we tolerate before seeking. */
const DRIFT_TOLERANCE = 1.5;
const FAV_GIFS_KEY = 'vibe.favgifs';

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatPos(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 900 : false,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

/** Loads the IFrame API once and resolves when it's ready. */
let ytReady: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
  return ytReady;
}

export default function Room() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isMobile = useIsMobile();

  const {
    user,
    currentRoom,
    connected,
    enterRoom,
    leaveRoom,
    chatOpen,
    queueOpen,
    toggleChat,
    toggleQueue,
    roomChat,
    sendChatMessage,
    editMessage,
    deleteMessage,
    addReaction,
    roomQueue,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    djs,
    joinLine,
    leaveLine,
    kickFromLine,
    reorderLine,
    playback,
    isMuted,
    toggleMute,
    playNext,
    syncPlayback,
    getPlaybackPosition,
    roomAvatars,
    bubbleMessages,
    bubblesEnabled,
    setBubblesEnabled,
    friends,
    addFriend,
    removeFriend,
    toggleSongFeedback,
    likedSongs,
    dislikedSongs,
    savedSongs,
  } = useStore();

  const currentSong = playback.current;
  const videoId = currentSong?.videoId || '';
  const canModerate = !!currentRoom?.canModerate;
  const inLine = djs.some((d) => d.id === user?.id);
  const myTurn = playback.djId && playback.djId === user?.id;

  /* ---------------------------------------------------------------- */
  /* Join / leave                                                      */
  /* ---------------------------------------------------------------- */
  const [joinFailed, setJoinFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    enterRoom(id).catch(() => {
      if (!cancelled) setJoinFailed(true);
    });
    return () => {
      cancelled = true;
      leaveRoom();
    };
  }, [id, enterRoom, leaveRoom]);

  /* ---------------------------------------------------------------- */
  /* Player                                                            */
  /*                                                                   */
  /* YouTube's own chrome is switched off (controls, keyboard, the     */
  /* fullscreen button) and a transparent guard sits over the iframe,  */
  /* so the only way to affect playback is through the room's own      */
  /* controls — which keeps everybody on the server's clock.           */
  /* ---------------------------------------------------------------- */
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [drift, setDrift] = useState(0);
  const [mode, setMode] = useState<'video' | 'art'>('video');

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || playerRef.current || !mountRef.current) return;
      // The API replaces the element it's handed with an iframe, so give it a
      // node we created ourselves — React must never try to clean that up.
      const host = document.createElement('div');
      mountRef.current.appendChild(host);
      playerRef.current = new window.YT.Player(host, {
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          autoplay: 1,
        },
        events: {
          onReady: () => !cancelled && setPlayerReady(true),
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* the iframe may already be gone */
      }
      playerRef.current = null;
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, []);

  /**
   * Autoplay with sound is blocked until the page has been interacted with,
   * so the player starts muted and quietly unmutes itself — on the first
   * click or keypress if the browser insisted. No "tap to start" wall.
   */
  const unmuteSoon = useCallback(() => {
    const apply = () => {
      const player = playerRef.current;
      if (!player || useStore.getState().isMuted) return;
      try {
        player.unMute();
        player.setVolume(85);
      } catch {
        /* player not ready yet */
      }
    };
    apply();
    const once = () => {
      apply();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !videoId) return;
    try {
      player.loadVideoById({ videoId, startSeconds: Math.max(0, getPlaybackPosition()) });
      player.mute();
    } catch {
      return;
    }
    const timer = setTimeout(unmuteSoon, 500);
    return () => clearTimeout(timer);
    // playback.revision changes whenever the server restarts/changes a track
  }, [videoId, playback.revision, playerReady, getPlaybackPosition, unmuteSoon]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady) return;
    try {
      if (isMuted) player.mute();
      else {
        player.unMute();
        player.setVolume(85);
      }
    } catch {
      /* ignore */
    }
  }, [isMuted, playerReady]);

  /** Drift correction — the thing that makes "synced" actually true. */
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player || !playerReady || !videoId || typeof player.getCurrentTime !== 'function') return;
      try {
        const target = getPlaybackPosition();
        const actual = player.getCurrentTime() || 0;
        const delta = actual - target;
        setDrift(delta);
        if (Math.abs(delta) > DRIFT_TOLERANCE) player.seekTo(target, true);
        // Covers a local pause: the server says we're playing, so we play.
        if (playback.isPlaying && player.getPlayerState?.() !== 1) player.playVideo();
      } catch {
        /* the player swallows calls made mid-load */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [playerReady, videoId, playback.isPlaying, getPlaybackPosition]);

  /* Ticking position for the progress bar. */
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPosition(getPlaybackPosition()), 500);
    return () => clearInterval(timer);
  }, [getPlaybackPosition]);

  const duration = currentSong?.duration || 0;
  const progress = duration ? Math.min(100, (position / duration) * 100) : 0;

  /* ---------------------------------------------------------------- */
  /* Panels                                                            */
  /* ---------------------------------------------------------------- */
  const panel: 'chat' | 'queue' | null = chatOpen ? 'chat' : queueOpen ? 'queue' : null;

  if (joinFailed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--background)' }}>
        <Icon.Disc size={36} />
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>That room isn't available.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary px-5 py-2.5 rounded-xl text-sm">
          <Icon.ArrowLeft size={16} /> Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* ---------------- title bar ---------------- */}
      <header className="title-bar flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <button onClick={() => navigate('/dashboard')} className="icon-btn w-9 h-9" title="Back to dashboard">
          <Icon.ArrowLeft size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
            <h1 className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-head)' }}>
              {currentRoom?.name || 'Loading…'}
            </h1>
          </div>
          <p className="text-xs truncate flex items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
            <Icon.Music size={12} />
            {currentSong ? currentSong.title : 'Nothing queued yet'}
            {currentSong && <span style={{ opacity: 0.6 }}>· {currentSong.addedBy}</span>}
          </p>
        </div>

        <button
          onClick={() => { syncPlayback(); playerRef.current?.seekTo(getPlaybackPosition(), true); }}
          className="icon-btn w-9 h-9"
          title={`Re-sync${Math.abs(drift) > DRIFT_TOLERANCE ? ' (out of step)' : ''}`}
          style={Math.abs(drift) > DRIFT_TOLERANCE ? { color: '#fbbf24' } : undefined}
        >
          <Icon.Sync size={17} />
        </button>
        <button onClick={toggleMute} className="icon-btn w-9 h-9" title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? <Icon.VolumeMute size={17} /> : <Icon.Volume size={17} />}
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ---------------- stage ---------------- */}
        <main className="room-stage flex-1 flex flex-col min-w-0 relative">
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6 overflow-y-auto">
            {/* Player — sized to the video, not stretched across the room. */}
            <div className="w-full flex flex-col items-center gap-3">
              <div className="player-shell" style={{ display: mode === 'video' ? 'block' : 'none' }}>
                <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
                {/* Blocks YouTube's own controls and the click-to-pause layer. */}
                <div className="player-guard" onClick={(e) => e.preventDefault()} />
              </div>

              {mode === 'art' && (
                <div
                  className="player-shell flex items-center justify-center"
                  style={{ background: 'linear-gradient(140deg, var(--primary), var(--accent))' }}
                >
                  {currentSong ? (
                    <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon.Disc size={64} />
                  )}
                </div>
              )}

              {/* Progress + controls */}
              <div className="w-full" style={{ maxWidth: 760 }}>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  <span style={{ fontFamily: 'var(--font-code)' }}>{formatPos(position)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setMode(mode === 'video' ? 'art' : 'video')}
                      className="icon-btn w-8 h-8"
                      title={mode === 'video' ? 'Show album art' : 'Show video'}
                    >
                      {mode === 'video' ? <Icon.Disc size={15} /> : <Icon.Video size={15} />}
                    </button>
                    <button onClick={playNext} className="icon-btn w-8 h-8" title="Skip to next track">
                      <Icon.SkipNext size={15} />
                    </button>
                  </div>
                  <span style={{ fontFamily: 'var(--font-code)' }}>{currentSong?.durationText || '0:00'}</span>
                </div>
              </div>
            </div>

            {/* Avatars */}
            <div className="w-full flex items-end justify-center gap-4 md:gap-8 flex-wrap pt-2">
              {roomAvatars.length === 0 && (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>Nobody else here yet.</p>
              )}
              {roomAvatars.map((avatar) => (
                <StageAvatar
                  key={avatar.id}
                  avatar={avatar}
                  bubble={bubblesEnabled ? bubbleMessages[avatar.id]?.text : undefined}
                  bubbleExiting={bubbleMessages[avatar.id]?.exiting}
                  isFriend={friends.includes(avatar.id)}
                  isDj={playback.djId === avatar.id}
                  onAddFriend={() => addFriend(avatar.id)}
                  onRemoveFriend={() => removeFriend(avatar.id)}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => setBubblesEnabled(!bubblesEnabled)}
            className="absolute top-3 right-3 z-20 btn-ghost px-3 py-1.5 rounded-xl text-xs"
            title="Toggle bubble chat"
          >
            <Icon.Chat size={14} /> Bubbles {bubblesEnabled ? 'on' : 'off'}
          </button>
        </main>

        {/* ---------------- side panel ---------------- */}
        {panel && (
          <aside
            className={
              isMobile
                ? 'fixed inset-0 z-40 flex flex-col room-sidebar'
                : 'room-sidebar w-[360px] flex-shrink-0 flex flex-col'
            }
          >
            {panel === 'chat' ? (
              <ChatPanel
                onClose={toggleChat}
                messages={roomChat}
                meId={user?.id || ''}
                canModerate={canModerate}
                onSend={sendChatMessage}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onReact={addReaction}
              />
            ) : (
              <QueuePanel
                onClose={toggleQueue}
                queue={roomQueue}
                djs={djs}
                meId={user?.id || ''}
                inLine={inLine}
                myTurn={!!myTurn}
                canModerate={canModerate}
                currentDjId={playback.djId}
                onAdd={addToQueue}
                onRemove={removeFromQueue}
                onReorder={reorderQueue}
                onJoinLine={joinLine}
                onLeaveLine={leaveLine}
                onKick={kickFromLine}
                onReorderLine={reorderLine}
              />
            )}
          </aside>
        )}
      </div>

      {/* ---------------- bottom bar ---------------- */}
      <footer className="bottom-bar flex items-center justify-center gap-1.5 sm:gap-3 px-3 py-2.5 flex-shrink-0">
        <BarBtn
          Glyph={Icon.Heart}
          label="Like"
          active={!!currentSong && likedSongs.includes(currentSong.videoId)}
          onClick={() => toggleSongFeedback('like')}
        />
        <BarBtn
          Glyph={Icon.ThumbDown}
          label="Dislike"
          active={!!currentSong && dislikedSongs.includes(currentSong.videoId)}
          onClick={() => toggleSongFeedback('dislike')}
        />
        <BarBtn
          Glyph={Icon.Bookmark}
          label="Save"
          active={!!currentSong && savedSongs.includes(currentSong.videoId)}
          onClick={() => toggleSongFeedback('save')}
        />
        <div className="w-px h-7 mx-1" style={{ background: 'var(--border)' }} />
        <BarBtn Glyph={Icon.Chat} label="Chat" active={chatOpen} onClick={toggleChat} />
        <BarBtn
          Glyph={Icon.QueueList}
          label="Queue"
          active={queueOpen}
          onClick={toggleQueue}
          badge={inLine ? (myTurn ? 'your turn' : `#${djs.findIndex((d) => d.id === user?.id) + 1}`) : undefined}
        />
        <div className="w-px h-7 mx-1" style={{ background: 'var(--border)' }} />
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-ghost px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ color: '#f87171' }}
        >
          <Icon.Exit size={16} /> <span className="hidden sm:inline">Leave</span>
        </button>
      </footer>
    </div>
  );
}

/* ================================================================== */
/* Stage avatar                                                        */
/* ================================================================== */

function StageAvatar({
  avatar,
  bubble,
  bubbleExiting,
  isFriend,
  isDj,
  onAddFriend,
  onRemoveFriend,
}: {
  avatar: any;
  bubble?: string;
  bubbleExiting?: boolean;
  isFriend: boolean;
  isDj: boolean;
  onAddFriend: () => void;
  onRemoveFriend: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="stage-avatar">
      {bubble && (
        <div className={`speech-bubble ${bubbleExiting ? 'bubble-exit' : 'bubble-enter'}`}>{bubble}</div>
      )}

      {open && (
        <div className="avatar-popup" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-bold mb-2 truncate">{avatar.username}</p>
          {!avatar.isCurrentUser && (
            <button
              onClick={() => { isFriend ? onRemoveFriend() : onAddFriend(); setOpen(false); }}
              className="btn-ghost w-full px-2 py-1.5 rounded-lg text-xs mb-1"
            >
              {isFriend ? <><Icon.Users size={13} /> Remove friend</> : <><Icon.Plus size={13} /> Add friend</>}
            </button>
          )}
          <button onClick={() => setOpen(false)} className="btn-ghost w-full px-2 py-1.5 rounded-lg text-xs">
            Close
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className={avatar.expression === 'bop' ? '' : 'avatar-idle'}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        title={avatar.username}
      >
        <AvatarSprite
          skin={avatar.avatarSkin}
          size={140}
          expression={avatar.expression}
          showBop={avatar.expression === 'bop'}
        />
      </button>

      <div
        className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ background: 'rgba(0,0,0,0.42)', color: '#fff', backdropFilter: 'blur(4px)' }}
      >
        {isDj && <span style={{ color: '#fbbf24', display: 'inline-flex' }}><Icon.Deck size={12} /></span>}
        {avatar.isCurrentUser && <span style={{ opacity: 0.7 }}>you ·</span>}
        <span className="truncate" style={{ maxWidth: 110 }}>{avatar.username}</span>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Chat                                                                */
/* ================================================================== */

function ChatPanel({
  onClose,
  messages,
  meId,
  canModerate,
  onSend,
  onEdit,
  onDelete,
  onReact,
}: {
  onClose: () => void;
  messages: any[];
  meId: string;
  canModerate: boolean;
  onSend: (text: string, type?: 'text' | 'gif', gifUrl?: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showGifs, setShowGifs] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<any>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (editingId) {
      onEdit(editingId, text);
      setEditingId(null);
    } else {
      onSend(text);
    }
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Chat" Glyph={Icon.Chat} onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            Nothing said yet. Say hello.
          </p>
        )}

        {messages.map((m) => {
          const mine = m.userId === meId;
          const canEdit = m.canEdit ?? mine;
          const canDelete = m.canDelete ?? (mine || canModerate);
          return (
            <div
              key={m.id}
              className="chat-message flex gap-2.5 relative group"
              onContextMenu={(e) => { e.preventDefault(); setMenuFor(menuFor === m.id ? null : m.id); }}
              onTouchStart={() => { pressTimer.current = setTimeout(() => setMenuFor(m.id), 480); }}
              onTouchEnd={() => clearTimeout(pressTimer.current)}
            >
              <div className="flex-shrink-0 pt-0.5">
                <AvatarSprite skin={m.avatarSkin} size={28} faceOnly />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold truncate">{m.username}</span>
                  <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    {formatTime(m.timestamp)}
                  </span>
                  {m.edited && !m.deleted && (
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>edited</span>
                  )}
                </div>

                {m.deleted ? (
                  <p className="text-xs italic" style={{ color: 'var(--muted-foreground)' }}>message deleted</p>
                ) : m.type === 'gif' ? (
                  <img src={m.gifUrl} alt="" className="rounded-xl mt-1 max-w-[190px]" />
                ) : (
                  <p className="text-sm leading-snug break-words">{m.text}</p>
                )}

                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {Object.entries(m.reactions).map(([emoji, users]: any) => (
                      <button
                        key={emoji}
                        onClick={() => onReact(m.id, emoji)}
                        className="px-1.5 py-0.5 rounded-full text-[11px]"
                        style={{
                          background: users.includes(meId)
                            ? 'color-mix(in srgb, var(--primary) 18%, transparent)'
                            : 'var(--secondary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                className="icon-btn w-7 h-7 opacity-0 group-hover:opacity-100 flex-shrink-0"
                aria-label="Message actions"
              >
                <Icon.Dots size={14} />
              </button>

              {menuFor === m.id && (
                <div
                  className="absolute right-0 top-6 z-30 rounded-xl border p-2"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--elev-2)', minWidth: 160 }}
                >
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onReact(m.id, emoji); setMenuFor(null); }}
                        className="w-7 h-7 rounded-lg text-sm"
                        style={{ background: 'var(--secondary)' }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {canEdit && m.type === 'text' && !m.deleted && (
                    <button
                      onClick={() => { setEditingId(m.id); setDraft(m.text); setMenuFor(null); }}
                      className="btn-ghost w-full px-2 py-1.5 rounded-lg text-xs mb-1 justify-start"
                    >
                      <Icon.Edit size={13} /> Edit
                    </button>
                  )}
                  {canDelete && !m.deleted && (
                    <button
                      onClick={() => { onDelete(m.id); setMenuFor(null); }}
                      className="btn-ghost w-full px-2 py-1.5 rounded-lg text-xs mb-1 justify-start"
                      style={{ color: '#f87171' }}
                    >
                      <Icon.Trash size={13} /> Delete
                    </button>
                  )}
                  <button onClick={() => setMenuFor(null)} className="btn-ghost w-full px-2 py-1.5 rounded-lg text-xs justify-start">
                    <Icon.Close size={13} /> Close
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {showGifs && (
        <GifPicker
          onPick={(url) => { onSend('', 'gif', url); setShowGifs(false); }}
          onClose={() => setShowGifs(false)}
        />
      )}

      <div className="border-t p-3 flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setShowGifs((v) => !v)}
          className={`icon-btn w-9 h-9 ${showGifs ? 'is-active' : ''}`}
          title="GIFs"
        >
          <Icon.Gif size={18} />
        </button>
        <input
          value={draft}
          maxLength={280}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setEditingId(null); setDraft(''); } }}
          placeholder={editingId ? 'Edit your message…' : 'Say something…'}
          className="input-field flex-1 px-3.5 py-2.5 rounded-xl text-sm"
        />
        <button onClick={submit} className="btn-primary w-10 h-10 rounded-xl" aria-label="Send">
          {editingId ? <Icon.Check size={17} /> : <Icon.Send size={17} />}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* GIF picker — search and favourites only                             */
/* ================================================================== */

function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'search' | 'favorites'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAV_GIFS_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const saveFavs = (next: string[]) => {
    setFavs(next);
    try {
      localStorage.setItem(FAV_GIFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (tab !== 'search') return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchApi.gifs(q, controller.signal);
        setResults(data.results || []);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, tab]);

  const shown = tab === 'search' ? results : favs.map((url) => ({ url, preview: url }));

  return (
    <div className="border-t flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', height: 280, background: 'var(--card)' }}>
      <div className="flex items-center gap-1 px-3 pt-2">
        {(['search', 'favorites'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-semibold capitalize ${tab === t ? 'tab-active' : 'tab-inactive'}`}
          >
            {t === 'search' ? <span className="flex items-center gap-1.5"><Icon.Search size={13} /> Search</span>
              : <span className="flex items-center gap-1.5"><Icon.Heart size={13} /> Favourites</span>}
          </button>
        ))}
        <button onClick={onClose} className="icon-btn w-8 h-8 ml-auto" aria-label="Close GIF picker">
          <Icon.Close size={15} />
        </button>
      </div>

      {tab === 'search' && (
        <div className="px-3 pt-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs…"
            className="input-field w-full px-3 py-2 rounded-xl text-sm"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-2 content-start">
        {shown.map((gif) => (
          <div key={gif.url} className="relative">
            <img
              src={gif.preview || gif.url}
              alt=""
              className="gif-result w-full h-20 object-cover rounded-lg"
              onClick={() => onPick(gif.url)}
            />
            <button
              onClick={() => saveFavs(favs.includes(gif.url) ? favs.filter((u) => u !== gif.url) : [...favs, gif.url])}
              className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.55)', color: favs.includes(gif.url) ? '#f472b6' : '#fff' }}
              aria-label="Favourite this GIF"
            >
              <Icon.Heart size={12} filled={favs.includes(gif.url)} />
            </button>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="col-span-3 text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>
            {loading ? 'Searching…' : tab === 'search' ? 'Type to search for a GIF.' : 'No favourites yet.'}
          </p>
        )}
      </div>

      {/* Works even when every public GIF provider is rate-limited. */}
      <div className="px-3 pb-3 flex gap-2">
        <input
          value={pasteUrl}
          onChange={(e) => setPasteUrl(e.target.value)}
          placeholder="…or paste a GIF URL"
          className="input-field flex-1 px-3 py-2 rounded-xl text-xs"
        />
        <button
          onClick={() => { if (pasteUrl.trim()) { onPick(pasteUrl.trim()); setPasteUrl(''); } }}
          className="btn-primary px-3 py-2 rounded-xl text-xs"
        >
          Send
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Queue + DJ line                                                     */
/* ================================================================== */

function QueuePanel({
  onClose,
  queue,
  djs,
  meId,
  inLine,
  myTurn,
  canModerate,
  currentDjId,
  onAdd,
  onRemove,
  onReorder,
  onJoinLine,
  onLeaveLine,
  onKick,
  onReorderLine,
}: {
  onClose: () => void;
  queue: any[];
  djs: any[];
  meId: string;
  inLine: boolean;
  myTurn: boolean;
  canModerate: boolean;
  currentDjId: string;
  onAdd: (item: { videoId: string; title: string; thumbnail: string; duration: number }) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onJoinLine: () => void;
  onLeaveLine: () => void;
  onKick: (userId: string) => void;
  onReorderLine: (from: number, to: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragDj = useRef<number | null>(null);

  /* Search fires as you type — no enter key needed. */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchApi.youtube(q, controller.signal);
        setResults(data.results || []);
      } catch {
        /* aborted or offline */
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const myTracks = useMemo(() => queue.filter((q) => q.addedById === meId).length, [queue, meId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Queue" Glyph={Icon.QueueList} onClose={onClose} />

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ---- DJ line ---- */}
        <section className="px-3 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: 'var(--primary)' }}><Icon.Deck size={15} /></span>
            <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
              DJ line
            </h3>
            <button
              onClick={inLine ? onLeaveLine : onJoinLine}
              className={inLine ? 'btn-ghost px-3 py-1.5 rounded-lg text-xs ml-auto' : 'btn-primary px-3 py-1.5 rounded-lg text-xs ml-auto'}
            >
              {inLine ? 'Leave line' : <><Icon.Plus size={13} /> Join the line</>}
            </button>
          </div>

          <p className="text-[11px] leading-snug mb-2.5" style={{ color: 'var(--muted-foreground)' }}>
            The room plays one track from each person's queue in turn. When your
            turn comes round, your next track starts.
            {inLine && myTracks === 0 && ' Add something below or your turn gets skipped.'}
          </p>

          {djs.length === 0 ? (
            <p className="text-xs py-3" style={{ color: 'var(--muted-foreground)' }}>
              Nobody's in the line — the room just plays the queue in order.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {djs.map((dj, index) => (
                <div
                  key={dj.id}
                  className={`dj-row ${dj.id === currentDjId ? 'is-current' : ''}`}
                  draggable={canModerate}
                  onDragStart={() => { dragDj.current = index; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragDj.current !== null && dragDj.current !== index) onReorderLine(dragDj.current, index);
                    dragDj.current = null;
                  }}
                >
                  {canModerate && (
                    <span className="queue-drag-handle" style={{ color: 'var(--muted-foreground)' }} title="Drag to reorder">
                      <Icon.Grip size={14} />
                    </span>
                  )}
                  <span className="text-xs font-bold w-4 text-center" style={{ color: 'var(--muted-foreground)' }}>
                    {index + 1}
                  </span>
                  <AvatarSprite skin={dj.avatarSkin} size={26} faceOnly />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">
                      {dj.username}
                      {dj.id === meId && <span style={{ color: 'var(--muted-foreground)' }}> · you</span>}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                      {dj.id === currentDjId ? 'on the decks now' : `${dj.trackCount} track${dj.trackCount === 1 ? '' : 's'} ready`}
                    </p>
                  </div>
                  {canModerate && dj.id !== meId && (
                    <button onClick={() => onKick(dj.id)} className="icon-btn w-7 h-7" title="Remove from line" style={{ color: '#f87171' }}>
                      <Icon.Close size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {myTurn && (
            <p className="text-xs font-semibold mt-2" style={{ color: 'var(--primary)' }}>
              You're on the decks right now.
            </p>
          )}
        </section>

        <div className="h-px mx-3 my-4" style={{ background: 'var(--border)' }} />

        {/* ---- Up next ---- */}
        <section className="px-3 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>
            Up next · {queue.length}
          </h3>

          {queue.length === 0 && (
            <p className="text-xs py-3" style={{ color: 'var(--muted-foreground)' }}>
              Nothing queued. Search below and add something.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {queue.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2 rounded-xl"
                style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
                draggable
                onDragStart={() => { dragItem.current = index; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragItem.current !== null && dragItem.current !== index) onReorder(dragItem.current, index);
                  dragItem.current = null;
                }}
              >
                <span className="queue-drag-handle" style={{ color: 'var(--muted-foreground)' }}>
                  <Icon.Grip size={14} />
                </span>
                <img src={item.thumbnail} alt="" className="w-12 h-9 rounded object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{item.title}</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                    {item.addedBy} · {item.durationText}
                  </p>
                </div>
                <div className="flex flex-col">
                  <button onClick={() => index > 0 && onReorder(index, index - 1)} className="icon-btn w-6 h-5" aria-label="Move up">
                    <Icon.ChevronUp size={13} />
                  </button>
                  <button onClick={() => index < queue.length - 1 && onReorder(index, index + 1)} className="icon-btn w-6 h-5" aria-label="Move down">
                    <Icon.ChevronDown size={13} />
                  </button>
                </div>
                <button onClick={() => onRemove(item.id)} className="icon-btn w-7 h-7" style={{ color: '#f87171' }} aria-label="Remove from queue">
                  <Icon.Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Search results ---- */}
        {(results.length > 0 || searching) && (
          <section className="px-3 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>
              {searching ? 'Searching…' : 'Results'}
            </h3>
            <div className="flex flex-col gap-1.5">
              {results.map((r) => (
                <div
                  key={r.videoId}
                  className="flex items-center gap-2 p-2 rounded-xl"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <img src={r.thumbnail} alt="" className="w-12 h-9 rounded object-cover flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{r.title}</p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {r.author} · {r.durationText}
                    </p>
                  </div>
                  <button
                    onClick={() => onAdd({ videoId: r.videoId, title: r.title, thumbnail: r.thumbnail, duration: r.duration })}
                    className="btn-primary w-8 h-8 rounded-lg"
                    aria-label={`Add ${r.title}`}
                  >
                    <Icon.Plus size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="border-t p-3 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }}>
            <Icon.Search size={15} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search YouTube…"
            className="input-field w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
          />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Shared bits                                                         */
/* ================================================================== */

function PanelHeader({ title, Glyph, onClose }: { title: string; Glyph: React.FC<any>; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
      <span style={{ color: 'var(--primary)' }}><Glyph size={17} /></span>
      <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-head)' }}>{title}</h2>
      <button onClick={onClose} className="icon-btn w-8 h-8 ml-auto" aria-label={`Close ${title}`}>
        <Icon.Close size={16} />
      </button>
    </div>
  );
}

function BarBtn({
  Glyph,
  label,
  onClick,
  active,
  badge,
}: {
  Glyph: React.FC<any>;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`btn-ghost px-3 py-2 rounded-xl text-xs font-semibold relative ${active ? 'is-active' : ''}`}
      style={active ? { color: 'var(--primary)', borderColor: 'var(--primary)' } : undefined}
      title={label}
    >
      <Glyph size={16} filled={!!active && (label === 'Like' || label === 'Save')} />
      <span className="hidden sm:inline">{label}</span>
      {badge && (
        <span
          className="absolute -top-1.5 -right-1.5 px-1.5 rounded-full text-[9px] font-bold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
