import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { AvatarSprite } from '../components/Avatar';
import * as Icon from '../components/Icons';
import { searchApi } from '../lib/api';
import { compressImageFile } from '../lib/image';
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
    reportDuration,
    roomAvatars,
    bubbleMessages,
    bubblesEnabled,
    setBubblesEnabled,
    friends,
    addFriend,
    removeFriend,
    toggleSongFeedback,
    myReaction,
    mySaved,
    savedSongs,
    songFeedbackCounts,
    favorites,
    favoritesLoaded,
    loadFavorites,
    addFavoriteToQueue,
    removeFavorite,
    updateRoom,
  } = useStore();

  const currentSong = playback.current;
  const videoId = currentSong?.videoId || '';
  const canModerate = !!currentRoom?.canModerate;
  const inLine = djs.some((d) => d.id === user?.id);
  const myTurn = playback.djId && playback.djId === user?.id;
  const isMyTrack = !!(myTurn || (currentSong?.addedById && currentSong.addedById === user?.id));
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!favoritesLoaded) loadFavorites();
  }, [favoritesLoaded, loadFavorites]);

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
  // Actual duration read from the YT player (fallback when DB value is 0).
  const [ytDuration, setYtDuration] = useState(0);

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
          onStateChange: (e: any) => {
            if (cancelled) return;
            const player = playerRef.current;
            if (!player) return;
            // Read duration once the video is cued/playing.
            if (e.data === window.YT?.PlayerState?.PLAYING ||
                e.data === window.YT?.PlayerState?.PAUSED ||
                e.data === window.YT?.PlayerState?.CUED) {
              try {
                const d = player.getDuration?.();
                if (d && d > 0) {
                  setYtDuration(d);
                  // If the DB duration is 0, report the real value back so
                  // the server can advance the queue correctly when the song ends.
                  const song = useStore.getState().playback.current;
                  if (song && !song.duration) {
                    useStore.getState().reportDuration(song.id, Math.round(d));
                  }
                }
              } catch { /* ignore */ }
            }
            // Video ended (state === 0) — do nothing, let the server tick
            // advance the queue. The drift-correction loop won't force
            // playVideo() any more, so no restart loop.
          },
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
    // Reset the cached YT duration when the track changes.
    setYtDuration(0);
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

  /** Drift indicator — tracks how far we are from the server clock.
   * Auto-seek / auto-resume is intentionally disabled; use the Sync button. */
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player || !playerReady || !videoId || typeof player.getCurrentTime !== 'function') return;
      try {
        const target = getPlaybackPosition();
        const actual = player.getCurrentTime() || 0;
        setDrift(actual - target);
        // Also refresh duration from the player if the DB value is missing.
        const d = player.getDuration?.();
        if (d && d > 0) setYtDuration((prev) => (prev === d ? prev : d));
      } catch {
        /* the player swallows calls made mid-load */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [playerReady, videoId, getPlaybackPosition]);

  /* Ticking position for the progress bar. */
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPosition(getPlaybackPosition()), 500);
    return () => clearInterval(timer);
  }, [getPlaybackPosition]);

  // Prefer the DB-stored duration; fall back to what the YT player reports.
  const duration = currentSong?.duration || ytDuration || 0;
  const progress = duration ? Math.min(100, (position / duration) * 100) : 0;

  /**
   * Resync playback immediately. When switching tabs on phones, the mobile
   * browser automatically pauses the YT iframe. Calling playVideo() inside this
   * user gesture handler unpauses it and restores synchronized audio.
   */
  const handleResync = useCallback(() => {
    syncPlayback();
    const player = playerRef.current;
    if (player) {
      try {
        const target = Math.max(0, getPlaybackPosition());
        player.seekTo?.(target, true);
        player.playVideo?.();
        if (!useStore.getState().isMuted) {
          player.unMute?.();
          player.setVolume?.(85);
        }
      } catch {
        /* player still initializing */
      }
    }
  }, [syncPlayback, getPlaybackPosition]);

  // When returning from background tab on mobile/desktop, auto-request sync and attempt play
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncPlayback();
        const player = playerRef.current;
        if (player && currentSong) {
          try {
            const target = Math.max(0, getPlaybackPosition());
            player.seekTo?.(target, true);
            player.playVideo?.();
          } catch {
            /* ignore */
          }
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [syncPlayback, getPlaybackPosition, currentSong]);

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
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>
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

        {canModerate && (
          <button
            onClick={() => setShowSettings(true)}
            className="icon-btn w-9 h-9"
            title="Room Background / Settings"
          >
            <Icon.Image size={17} />
          </button>
        )}
        <button
          onClick={handleResync}
          className="icon-btn w-9 h-9"
          title={`Re-sync${Math.abs(drift) > DRIFT_TOLERANCE ? ' (tap to sync/play)' : ''}`}
          style={Math.abs(drift) > DRIFT_TOLERANCE ? { color: '#fbbf24', borderColor: '#fbbf24' } : undefined}
        >
          <Icon.Sync size={17} />
        </button>
        <button onClick={toggleMute} className="icon-btn w-9 h-9" title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? <Icon.VolumeMute size={17} /> : <Icon.Volume size={17} />}
        </button>
      </header>

      <div className={`flex-1 flex min-h-0 ${isMobile ? 'flex-col' : 'flex-row'}`}>
        {/* ---------------- stage ---------------- */}
        <main
          className={`room-stage flex flex-col min-w-0 relative ${
            isMobile && panel ? 'flex-none' : 'flex-1'
          }`}
          style={isMobile && panel ? { height: '38vh' } : undefined}
        >
          {/* Custom Room Background image / GIF */}
          {currentRoom?.backgroundUrl && (
            <div
              className="absolute inset-0 pointer-events-none z-0 bg-cover bg-center transition-all duration-700"
              style={{
                backgroundImage: `url(${currentRoom.backgroundUrl})`,
              }}
            >
              <div className="absolute inset-0 bg-black/45 backdrop-blur-[0.5px]" />
            </div>
          )}
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
                    {(canModerate || myTurn) && (
                      <button onClick={playNext} className="icon-btn w-8 h-8" title="Skip to next track">
                        <Icon.SkipNext size={15} />
                      </button>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-code)' }}>{currentSong?.durationText || '0:00'}</span>
                </div>
              </div>
            </div>

            {/* Avatars — hidden while the chat/queue panel is open on mobile,
                since the stage has been squeezed down to just the player. */}
            {!(isMobile && panel) && (
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
                    size={isMobile ? 76 : 108}
                    onAddFriend={() => addFriend(avatar.id)}
                    onRemoveFriend={() => removeFriend(avatar.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {!(isMobile && panel) && (
            <button
              onClick={() => setBubblesEnabled(!bubblesEnabled)}
              className="absolute top-3 right-3 z-20 btn-ghost px-3 py-1.5 rounded-xl text-xs"
              title="Toggle bubble chat"
            >
              <Icon.Chat size={14} /> Bubbles {bubblesEnabled ? 'on' : 'off'}
            </button>
          )}
        </main>

        {/* ---------------- side panel ---------------- */}
        {panel && (
          <aside
            className={
              isMobile
                ? 'flex-1 min-h-0 flex flex-col room-sidebar'
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
                favorites={favorites}
                onAddFavoriteToQueue={addFavoriteToQueue}
                onRemoveFavorite={removeFavorite}
              />
            )}
          </aside>
        )}
      </div>

      {/* ---------------- bottom bar ---------------- */}
      <footer className="bottom-bar flex items-center justify-center gap-1.5 sm:gap-3 px-3 py-2.5 flex-shrink-0">
        {/* Feedback buttons are disabled rather than hidden when your own song is playing. */}
        <BarBtn
          Glyph={Icon.Heart}
          label="Like"
          count={songFeedbackCounts.like}
          active={!!currentSong && myReaction === 'like'}
          disabled={!currentSong || isMyTrack}
          title={isMyTrack ? "You can't like your own track" : !currentSong ? "No track playing" : "Like"}
          onClick={() => {
            if (!currentSong || isMyTrack) return;
            toggleSongFeedback('like');
          }}
        />
        <BarBtn
          Glyph={Icon.ThumbDown}
          label="Dislike"
          count={songFeedbackCounts.dislike}
          active={!!currentSong && myReaction === 'dislike'}
          disabled={!currentSong || isMyTrack}
          title={isMyTrack ? "You can't dislike your own track" : !currentSong ? "No track playing" : "Dislike"}
          onClick={() => {
            if (!currentSong || isMyTrack) return;
            toggleSongFeedback('dislike');
          }}
        />
        <BarBtn
          Glyph={Icon.Bookmark}
          label="Save"
          count={songFeedbackCounts.save}
          active={!!currentSong && mySaved}
          disabled={!currentSong || isMyTrack}
          title={isMyTrack ? "You can't save your own track" : !currentSong ? "No track playing" : "Save"}
          onClick={() => {
            if (!currentSong || isMyTrack) return;
            toggleSongFeedback('save');
          }}
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

      {showSettings && currentRoom && (
        <RoomSettingsModal
          room={currentRoom}
          onClose={() => setShowSettings(false)}
          onSave={async (data) => {
            await updateRoom(currentRoom.id, data);
          }}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* Room Settings / Background customizer                              */
/* ================================================================== */

function RoomSettingsModal({
  room,
  onClose,
  onSave,
}: {
  room: any;
  onClose: () => void;
  onSave: (data: { backgroundUrl: string }) => Promise<void>;
}) {
  const [bgUrl, setBgUrl] = useState(room.backgroundUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const presets = [
    { name: '🌆 Cyber City', url: 'https://media.giphy.com/media/26tn3334vHJwdAnCw/giphy.gif' },
    { name: '🌧️ Lofi Rain', url: 'https://media.giphy.com/media/L3ERvA6jWCd0qO4NdX/giphy.gif' },
    { name: '🌅 Synth Sunset', url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif' },
    { name: '☕ Anime Cafe', url: 'https://media.giphy.com/media/3o7btQ8jDTPGDpgc6I/giphy.gif' },
    { name: '📻 Retro Vinyl', url: 'https://media.giphy.com/media/3o7aCSPqXE5C6T8tBC/giphy.gif' },
    { name: '✨ Neon Stars', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80' },
  ];

  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('Image/GIF must be under 2MB.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setBgUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({ backgroundUrl: bgUrl });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save background');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--primary)' }}><Icon.Image size={20} /></span>
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-head)' }}>
              Room Background
            </h2>
          </div>
          <button onClick={onClose} className="icon-btn w-8 h-8" aria-label="Close">
            <Icon.Close size={16} />
          </button>
        </div>

        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Set a unique background image or animated GIF for this room. Each room maintains its own separate backdrop.
        </p>

        {/* Live Preview */}
        <div
          className="w-full h-36 rounded-xl overflow-hidden relative flex items-center justify-center border"
          style={{
            borderColor: 'var(--border)',
            background: bgUrl ? `url(${bgUrl}) center / cover no-repeat` : 'var(--secondary)',
          }}
        >
          {bgUrl && <div className="absolute inset-0 bg-black/35 backdrop-blur-[0.5px]" />}
          <div className="relative z-10 flex flex-col items-center gap-1 text-center px-4">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-md">
              {bgUrl ? 'Preview: Custom Backdrop Active' : 'Default Theme Gradient'}
            </span>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}

        {/* URL Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">Image or GIF URL</label>
          <div className="flex gap-2">
            <input
              value={bgUrl}
              onChange={(e) => { setBgUrl(e.target.value); setError(''); }}
              placeholder="https://example.com/backdrop.gif or image URL…"
              className="input-field flex-1 px-3 py-2 rounded-xl text-xs"
            />
            {bgUrl && (
              <button
                type="button"
                onClick={() => setBgUrl('')}
                className="btn-ghost px-2.5 py-2 rounded-xl text-xs"
                title="Reset to default theme gradient"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>
            Aesthetic Presets
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {presets.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setBgUrl(p.url)}
                className={`flex items-center gap-1.5 p-2 rounded-xl text-xs font-medium border text-left transition-all ${
                  bgUrl === p.url ? 'border-primary bg-primary/10' : 'border-border bg-secondary/60 hover:bg-secondary'
                }`}
              >
                <img src={p.url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Upload File */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.gif"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-ghost px-3 py-2 rounded-xl text-xs flex items-center gap-1.5"
          >
            <Icon.Plus size={14} /> Upload image or GIF from device
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-4 py-2 rounded-xl text-xs"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            disabled={saving}
          >
            {saving ? 'Saving…' : <><Icon.Check size={14} /> Save Background</>}
          </button>
        </div>
      </div>
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
  size = 108,
  onAddFriend,
  onRemoveFriend,
}: {
  avatar: any;
  bubble?: string;
  bubbleExiting?: boolean;
  isFriend: boolean;
  isDj: boolean;
  size?: number;
  onAddFriend: () => void;
  onRemoveFriend: () => void;
}) {
  const [open, setOpen] = useState(false);

  // Tapping anywhere outside the popup closes it — it used to only close
  // via its own "Close" button, so it'd stay open forever otherwise.
  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (e: Event) => {
      const target = e.target as Node;
      if (!(target instanceof Node)) return;
      if (!(target as Element).closest?.('.avatar-popup, .avatar-idle, .stage-avatar button')) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeIfOutside);
    return () => document.removeEventListener('pointerdown', closeIfOutside);
  }, [open]);

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
          size={size}
          expression={avatar.expression}
          showBop={avatar.expression === 'bop' || avatar.expression === 'happy'}
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
  onSend: (text: string, type?: 'text' | 'gif' | 'image', gifUrl?: string, replyTo?: string | null) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [showGifs, setShowGifs] = useState(false);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (file: File | null) => {
    if (!file) return;
    setSendingPhoto(true);
    try {
      const dataUrl = await compressImageFile(file);
      onSend('', 'image', dataUrl, replyingTo?.id || null);
      setReplyingTo(null);
    } catch {
      // image failed to load/encode — nothing sent, composer stays as-is
    } finally {
      setSendingPhoto(false);
    }
  };
  const endRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<any>(null);

  // Tapping anywhere outside the open message-options menu closes it.
  useEffect(() => {
    if (!menuFor) return;
    const closeIfOutside = (e: Event) => {
      const target = e.target as Node;
      if (!(target instanceof Node)) return;
      if (!(target as Element).closest?.('.chat-options-menu, .chat-options-trigger')) {
        setMenuFor(null);
      }
    };
    document.addEventListener('pointerdown', closeIfOutside);
    return () => document.removeEventListener('pointerdown', closeIfOutside);
  }, [menuFor]);

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
      onSend(text, 'text', undefined, replyingTo?.id || null);
      setReplyingTo(null);
    }
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Chat" Glyph={Icon.Chat} onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            Nothing said yet. Say hello.
          </p>
        )}

        {(() => {
          // Deleted messages disappear entirely instead of leaving a
          // "message deleted" placeholder bubble behind.
          const visible = messages.filter((m) => !m.deleted);
          return visible.map((m, i) => {
          const prev = visible[i - 1];
          // Consecutive messages from the same person collapse the
          // avatar/name/timestamp header, like most chat apps — it comes
          // back the moment anyone else posts in between.
          const grouped = !!prev && prev.userId === m.userId;
          const mine = m.userId === meId;
          const canEdit = m.canEdit ?? mine;
          const canDelete = m.canDelete ?? (mine || canModerate);
          return (
            <div
              key={m.id}
              className={`chat-message flex gap-2.5 relative group ${menuFor === m.id ? 'z-40' : 'z-0'} ${
                i === 0 ? '' : grouped ? 'mt-1' : 'mt-3'
              }`}
              onContextMenu={(e) => { e.preventDefault(); setMenuFor(menuFor === m.id ? null : m.id); }}
              onTouchStart={() => { pressTimer.current = setTimeout(() => setMenuFor(m.id), 480); }}
              onTouchEnd={() => clearTimeout(pressTimer.current)}
            >
              <div className="w-7 flex-shrink-0 pt-0.5">
                {!grouped && (
                  m.avatarImage ? (
                    <img src={m.avatarImage} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <AvatarSprite skin={m.avatarSkin} size={28} faceOnly />
                  )
                )}
              </div>

              <div className="min-w-0 flex-1">
                {!grouped && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold truncate">{m.username}</span>
                  <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    {formatTime(m.timestamp)}
                  </span>
                  {m.edited && !m.deleted && (
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>edited</span>
                  )}
                </div>
                )}

                {m.replyTo && (
                  <div
                    className="flex items-center gap-1.5 mt-1 mb-0.5 pl-2 text-[11px] truncate"
                    style={{ borderLeft: '2px solid var(--border)', color: 'var(--muted-foreground)' }}
                  >
                    <span className="font-semibold flex-shrink-0">{m.replyTo.username}:</span>
                    <span className="truncate" style={{ fontStyle: m.replyTo.deleted ? 'italic' : undefined }}>
                      {m.replyTo.text}
                    </span>
                  </div>
                )}

                {m.deleted ? (
                  <p className="text-xs italic" style={{ color: 'var(--muted-foreground)' }}>message deleted</p>
                ) : m.type === 'gif' ? (
                  <img src={m.gifUrl} alt="" className="rounded-xl mt-1 max-w-[190px]" />
                ) : m.type === 'image' ? (
                  <img src={m.imageData} alt="" className="rounded-xl mt-1 max-w-[220px] max-h-[280px] object-cover" />
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

              {/* Always tappable — hover-only chrome doesn't exist on a phone. */}
              <button
                onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                className="icon-btn w-7 h-7 flex-shrink-0 chat-options-trigger"
                style={{ opacity: 0.65 }}
                aria-label="Message actions"
              >
                <Icon.Dots size={14} />
              </button>

              {menuFor === m.id && (
                <div
                  className="absolute right-0 bottom-full mb-1 z-30 rounded-xl border p-2 chat-options-menu"
                  style={{
                    background: 'color-mix(in srgb, var(--card) 94%, transparent)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderColor: 'var(--border)',
                    boxShadow: 'var(--elev-2)',
                    minWidth: 160,
                  }}
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
                  {!m.deleted && (
                    <button
                      onClick={() => { setReplyingTo(m); setEditingId(null); setMenuFor(null); }}
                      className="btn-ghost w-full px-2 py-1.5 rounded-lg text-xs mb-1 justify-start"
                    >
                      <Icon.ArrowLeft size={13} style={{ transform: 'scaleX(-1)' }} /> Reply
                    </button>
                  )}
                  {canEdit && m.type === 'text' && !m.deleted && (
                    <button
                      onClick={() => { setEditingId(m.id); setDraft(m.text); setReplyingTo(null); setMenuFor(null); }}
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
                </div>
              )}
            </div>
          );
          });
        })()}
        <div ref={endRef} />
      </div>

      {showGifs && (
        <GifPicker
          onPick={(url) => { onSend('', 'gif', url, replyingTo?.id || null); setReplyingTo(null); setShowGifs(false); }}
          onClose={() => setShowGifs(false)}
        />
      )}

      {replyingTo && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-t flex-shrink-0 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}
        >
          <span style={{ color: 'var(--muted-foreground)' }}>Replying to</span>
          <span className="font-semibold truncate flex-1">{replyingTo.username}</span>
          <button onClick={() => setReplyingTo(null)} className="icon-btn w-6 h-6" aria-label="Cancel reply">
            <Icon.Close size={12} />
          </button>
        </div>
      )}

      <div className="border-t p-3 flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setShowGifs((v) => !v)}
          className={`icon-btn w-9 h-9 ${showGifs ? 'is-active' : ''}`}
          title="GIFs"
        >
          <Icon.Gif size={18} />
        </button>
        <button
          onClick={() => photoInputRef.current?.click()}
          className="icon-btn w-9 h-9"
          title="Send a photo"
          disabled={sendingPhoto}
        >
          <Icon.Image size={18} />
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickPhoto(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
        <input
          value={draft}
          maxLength={280}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setEditingId(null); setReplyingTo(null); setDraft(''); } }}
          placeholder={editingId ? 'Edit your message…' : replyingTo ? `Reply to ${replyingTo.username}…` : 'Say something…'}
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
  favorites,
  onAddFavoriteToQueue,
  onRemoveFavorite,
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
  onReorder: (fromId: string, toId: string) => void;
  onJoinLine: () => void;
  onLeaveLine: () => void;
  onKick: (userId: string) => void;
  onReorderLine: (from: number, to: number) => void;
  favorites: any[];
  onAddFavoriteToQueue: (track: any) => void;
  onRemoveFavorite: (videoId: string) => void;
}) {
  const [tab, setTab] = useState<'queue' | 'dj' | 'favorites'>('queue');
  const [queueSubView, setQueueSubView] = useState<'myQueue' | 'results'>('myQueue');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);
  const dragItem = useRef<string | null>(null);
  const dragDj = useRef<number | null>(null);

  /* Helper: does this string look like a YouTube URL or bare video ID? */
  const isYouTubeUrl = (s: string) =>
    /youtu\.be\/|youtube\.com\/|^[A-Za-z0-9_-]{11}$/.test(s);

  // Automatically switch to search results when typing
  useEffect(() => {
    if (query.trim().length >= 2) {
      setQueueSubView('results');
    }
  }, [query]);

  const handleAddTrack = (r: SearchResult) => {
    onAdd({ videoId: r.videoId, title: r.title, thumbnail: r.thumbnail, duration: r.duration });
    setAddedNotice(r.videoId);
    setTimeout(() => {
      setAddedNotice((prev) => (prev === r.videoId ? null : prev));
    }, 1500);
  };

  /* Search fires as you type — no enter key needed.
     If the input looks like a YouTube link, we do a direct lookup
     instead of a search so we get the exact video immediately. */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    if (isYouTubeUrl(q)) {
      // Direct URL / video ID — resolve immediately, no debounce
      setSearching(true);
      searchApi.youtubeLookup(q, controller.signal)
        .then((info: any) => {
          if (info && info.videoId) setResults([info]);
          else setResults([]);
        })
        .catch(() => { /* aborted or offline */ })
        .finally(() => setSearching(false));
      return () => { controller.abort(); };
    }
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

  // Only your own tracks show up here — everyone's personal queue stays
  // private to them; the DJ line (its own tab) is what shows whose turn is
  // coming up.
  const myQueue = useMemo(() => queue.filter((q) => q.addedById === meId), [queue, meId]);
  const myTracks = myQueue.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PanelHeader title="Queue" Glyph={Icon.QueueList} onClose={onClose} />

      <div className="flex items-center gap-1 px-3 pt-2 flex-shrink-0">
        {([
          { id: 'queue' as const, label: 'Queue' },
          { id: 'dj' as const, label: `DJ line${djs.length ? ` · ${djs.length}` : ''}` },
          { id: 'favorites' as const, label: `Favourites${favorites.length ? ` · ${favorites.length}` : ''}` },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold ${tab === t.id ? 'tab-active' : 'tab-inactive'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'favorites' ? (
        <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3">
          {favorites.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>
              Nothing saved yet. Hit save on a track from the bottom bar while it's playing.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {favorites.map((track) => (
                <div
                  key={track.videoId}
                  className="flex items-center gap-2 p-2 rounded-xl"
                  style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
                >
                  <img src={track.thumbnail} alt="" className="w-12 h-9 rounded object-cover flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{track.title}</p>
                  </div>
                  <button
                    onClick={() => onAddFavoriteToQueue(track)}
                    className="icon-btn w-7 h-7"
                    title="Add to queue"
                    aria-label={`Add ${track.title} to queue`}
                  >
                    <Icon.Plus size={14} />
                  </button>
                  <button
                    onClick={() => onRemoveFavorite(track.videoId)}
                    className="icon-btn w-7 h-7"
                    style={{ color: '#f87171' }}
                    title="Remove from favourites"
                    aria-label={`Remove ${track.title} from favourites`}
                  >
                    <Icon.Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'dj' ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ---- DJ line ---- */}
          <section className="px-3 pt-3 pb-3">
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
              Nobody plays until they've joined the line and it's their turn — the
              room stays quiet otherwise.
              {inLine && myTracks === 0 && ' Add something in the Queue tab or your turn gets skipped.'}
              {inLine && ' Leaving the line while your track is playing skips it right away.'}
            </p>

            {djs.length === 0 ? (
              <p className="text-xs py-3" style={{ color: 'var(--muted-foreground)' }}>
                Nobody's in the line yet — join it to start the music.
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
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* ---- Sticky Search + Switcher at Top of Queue ---- */}
          <div className="px-3 pt-2.5 pb-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted-foreground)' }}>
                <Icon.Search size={15} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search YouTube or paste a link…"
                className="input-field w-full pl-9 pr-8 py-2 rounded-xl text-xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setQueueSubView('myQueue'); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-60 hover:opacity-100 p-0.5"
                  aria-label="Clear search"
                >
                  <Icon.Close size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => setQueueSubView('myQueue')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  queueSubView === 'myQueue' ? 'bg-primary text-primary-foreground shadow-sm' : 'btn-ghost'
                }`}
              >
                <span>Your Queue</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white/20">
                  {myTracks}
                </span>
              </button>

              {(results.length > 0 || searching || query.trim().length > 0) && (
                <button
                  type="button"
                  onClick={() => setQueueSubView('results')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    queueSubView === 'results' ? 'bg-primary text-primary-foreground shadow-sm' : 'btn-ghost'
                  }`}
                >
                  <span>Results</span>
                  {results.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white/20">
                      {results.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {queueSubView === 'results' ? (
              /* ---- Search results (Instant & prominent on mobile!) ---- */
              <section className="px-3 pt-3 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    {searching ? 'Searching…' : `Results · ${results.length}`}
                  </h3>
                  {results.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQueueSubView('myQueue')}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: 'var(--primary)' }}
                    >
                      View Queue ({myTracks}) →
                    </button>
                  )}
                </div>

                {searching && results.length === 0 && (
                  <div className="py-8 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    <Icon.Sync size={18} className="mx-auto mb-2 animate-spin" />
                    Searching YouTube…
                  </div>
                )}

                {!searching && results.length === 0 && (
                  <p className="text-xs py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>
                    {query.trim() ? 'No results found.' : 'Type above to search YouTube.'}
                  </p>
                )}

                <div className="flex flex-col gap-1.5">
                  {results.map((r) => {
                    const isAdded = addedNotice === r.videoId;
                    return (
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
                          type="button"
                          onClick={() => handleAddTrack(r)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                            isAdded ? 'bg-green-600 text-white' : 'btn-primary'
                          }`}
                          aria-label={`Add ${r.title}`}
                          title="Add to queue"
                        >
                          {isAdded ? <Icon.Check size={16} /> : <Icon.Plus size={15} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              /* ---- Up next (your own tracks) ---- */
              <section className="px-3 pt-3 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    Your queue · {myQueue.length}
                  </h3>
                  {results.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQueueSubView('results')}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: 'var(--primary)' }}
                    >
                      ← Back to Results ({results.length})
                    </button>
                  )}
                </div>

                {myQueue.length === 0 && (
                  <div className="py-6 text-center">
                    <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
                      Nothing queued yet.
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                      Search above or paste a YouTube link to add songs to the line.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  {myQueue.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 rounded-xl"
                      style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
                      draggable
                      onDragStart={() => { dragItem.current = item.id; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragItem.current !== null && dragItem.current !== item.id) onReorder(dragItem.current, item.id);
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
                          {item.durationText}
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <button
                          onClick={() => index > 0 && onReorder(item.id, myQueue[index - 1].id)}
                          className="icon-btn w-6 h-5"
                          aria-label="Move up"
                        >
                          <Icon.ChevronUp size={13} />
                        </button>
                        <button
                          onClick={() => index < myQueue.length - 1 && onReorder(item.id, myQueue[index + 1].id)}
                          className="icon-btn w-6 h-5"
                          aria-label="Move down"
                        >
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
            )}
          </div>
        </div>
      )}
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
  disabled,
  title,
  badge,
  count,
}: {
  Glyph: React.FC<any>;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  badge?: string;
  count?: number;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`btn-ghost px-3 py-2 rounded-xl text-xs font-semibold relative ${active ? 'is-active' : ''} ${
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-auto' : ''
      }`}
      style={active ? { color: 'var(--primary)', borderColor: 'var(--primary)' } : undefined}
      title={title || label}
    >
      <Glyph size={16} filled={!!active && (label === 'Like' || label === 'Save')} />
      <span className="hidden sm:inline">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="text-[10px] sm:text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {count}
        </span>
      )}
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
