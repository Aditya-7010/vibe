/**
 * Global client state.
 *
 * Nothing here is mock data any more: rooms, chat, queue and playback all come
 * from Django. REST is used for one-shot things (auth, room list, search) and
 * a single WebSocket per room carries everything realtime.
 */

import { create } from 'zustand';
import {
  ApiError,
  auth as authApi,
  feedbackApi,
  getToken,
  roomsApi,
  setToken,
} from './lib/api';
import { applyAppearance, applyThemeClass } from './lib/appearance';
import { RoomSocket, SocketEvent } from './lib/socket';
import {
  BubbleMessage,
  ChatMessage,
  DJ,
  Expression,
  PlaybackState,
  QueueItem,
  Room,
  RoomAvatar,
  Theme,
  User,
} from './types';

const THEME_KEY = 'vibe.theme';
const BUBBLE_MS = 5000;

const VALID_THEMES: Theme[] = ['dark', 'light', 'skeu'];

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    return stored && VALID_THEMES.includes(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  applyThemeClass(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

const emptyPlayback: PlaybackState = {
  revision: 0,
  djId: '',
  isPlaying: false,
  position: 0,
  serverTime: 0,
  startedAt: 0,
  current: null,
  receivedAt: Date.now(),
};

interface AppState {
  /* session */
  user: User | null;
  isLoggedIn: boolean;
  booting: boolean;
  theme: Theme;

  /* dashboard */
  rooms: Room[];
  roomsLoading: boolean;
  favoriteRooms: string[];

  /* current room */
  currentRoom: Room | null;
  connected: boolean;
  socket: RoomSocket | null;
  roomAvatars: RoomAvatar[];
  roomChat: ChatMessage[];
  roomQueue: QueueItem[];
  djs: DJ[];
  playback: PlaybackState;
  bubbleMessages: Record<string, BubbleMessage>;
  friends: string[];
  savedSongs: string[];
  likedSongs: string[];
  dislikedSongs: string[];

  /* ui */
  chatOpen: boolean;
  queueOpen: boolean;
  isMuted: boolean;
  bubblesEnabled: boolean;
  error: string | null;

  /* actions */
  bootstrap: () => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: Partial<Record<string, any>>) => Promise<void>;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  loadRooms: (params?: { q?: string }) => Promise<void>;
  createRoom: (name: string, description: string) => Promise<Room>;
  deleteRoom: (roomId: string) => Promise<void>;
  toggleFavoriteRoom: (roomId: string) => Promise<void>;

  enterRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => void;

  toggleChat: () => void;
  toggleQueue: () => void;
  toggleMute: () => void;
  setBubblesEnabled: (on: boolean) => void;

  sendChatMessage: (text: string, type?: 'text' | 'gif', gifUrl?: string) => void;
  editMessage: (id: string, text: string) => void;
  deleteMessage: (id: string) => void;
  addReaction: (id: string, emoji: string) => void;

  addToQueue: (item: {
    videoId: string;
    title: string;
    thumbnail: string;
    duration: number;
  }) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue: (fromIdx: number, toIdx: number) => void;
  playNext: () => void;
  syncPlayback: () => void;
  getPlaybackPosition: () => number;

  joinLine: () => void;
  leaveLine: () => void;
  kickFromLine: (userId: string) => void;
  reorderLine: (fromIdx: number, toIdx: number) => void;

  triggerLikeEffect: () => void;
  toggleSongFeedback: (kind: 'like' | 'dislike' | 'save') => Promise<void>;

  addFriend: (userId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  setError: (message: string | null) => void;
}

export const useStore = create<AppState>((set, get) => {
  /** Bumped on every room entry/exit so stale async work can bail out. */
  let enterTicket = 0;

  /* ---------------------------------------------------------------- */
  /* WebSocket event handling                                          */
  /* ---------------------------------------------------------------- */
  const handleEvent = (event: SocketEvent) => {
    const me = get().user;
    const meId = me?.id || '';

    switch (event.type) {
      case 'init': {
        const { room, presences, messages, queue, djs, playback } = event.payload;
        set({
          currentRoom: room,
          roomAvatars: (presences as RoomAvatar[]).map((p) => ({
            ...p,
            isCurrentUser: p.id === meId,
          })),
          roomChat: messages,
          roomQueue: queue,
          djs: djs || [],
          playback: { ...playback, receivedAt: Date.now() },
        });
        break;
      }
      case 'presence_join': {
        const avatar = { ...event.payload, isCurrentUser: event.payload.id === meId };
        set((s) => ({
          roomAvatars: [...s.roomAvatars.filter((a) => a.id !== avatar.id), avatar],
        }));
        break;
      }
      case 'presence_leave': {
        set((s) => ({
          roomAvatars: s.roomAvatars.filter((a) => a.id !== event.payload.id),
        }));
        break;
      }
      case 'expression': {
        const { id, expression } = event.payload;
        set((s) => ({
          roomAvatars: s.roomAvatars.map((a) =>
            a.id === id ? { ...a, expression: expression as Expression } : a,
          ),
        }));
        break;
      }
      case 'chat': {
        // Guard against a duplicate socket (React StrictMode remounts in dev
        // used to leave two open) delivering the same message twice.
        set((s) =>
          s.roomChat.some((m) => m.id === event.payload.id)
            ? {}
            : { roomChat: [...s.roomChat, event.payload] },
        );
        break;
      }
      case 'chat_update': {
        set((s) => ({
          roomChat: s.roomChat.map((m) =>
            m.id === event.payload.id ? { ...m, ...event.payload } : m,
          ),
        }));
        break;
      }
      case 'bubble': {
        if (!get().bubblesEnabled) break;
        const { id, text } = event.payload;
        set((s) => ({
          bubbleMessages: {
            ...s.bubbleMessages,
            [id]: { text, timestamp: Date.now(), exiting: false },
          },
        }));
        setTimeout(() => {
          set((s) => {
            const bubble = s.bubbleMessages[id];
            if (!bubble) return {};
            return {
              bubbleMessages: { ...s.bubbleMessages, [id]: { ...bubble, exiting: true } },
            };
          });
        }, BUBBLE_MS - 500);
        setTimeout(() => {
          set((s) => {
            const next = { ...s.bubbleMessages };
            delete next[id];
            return { bubbleMessages: next };
          });
        }, BUBBLE_MS);
        break;
      }
      case 'queue': {
        set({ roomQueue: event.payload });
        break;
      }
      case 'djs': {
        set({ djs: event.payload || [] });
        break;
      }
      case 'playback': {
        set({ playback: { ...event.payload, receivedAt: Date.now() } });
        break;
      }
      case 'error': {
        set({ error: event.payload?.detail || 'Something went wrong.' });
        break;
      }
      default:
        break;
    }
  };

  const applyAuth = (payload: { token: string; user: User }) => {
    setToken(payload.token);
    applyTheme(payload.user.theme || 'dark');
    applyAppearance(payload.user);
    set({
      user: payload.user,
      isLoggedIn: true,
      theme: payload.user.theme || 'dark',
      friends: payload.user.friends || [],
      bubblesEnabled: payload.user.bubbleChatEnabled ?? true,
    });
  };

  return {
    user: null,
    isLoggedIn: false,
    booting: true,
    theme: readTheme(),

    rooms: [],
    roomsLoading: false,
    favoriteRooms: [],

    currentRoom: null,
    connected: false,
    socket: null,
    roomAvatars: [],
    roomChat: [],
    roomQueue: [],
    djs: [],
    playback: emptyPlayback,
    bubbleMessages: {},
    friends: [],
    savedSongs: [],
    likedSongs: [],
    dislikedSongs: [],

    chatOpen: false,
    queueOpen: false,
    isMuted: false,
    bubblesEnabled: true,
    error: null,

    /* ---------------- session ---------------- */
    bootstrap: async () => {
      applyTheme(get().theme);
      if (!getToken()) {
        set({ booting: false });
        return;
      }
      try {
        const user = await authApi.me();
        applyTheme(user.theme || 'dark');
        applyAppearance(user);
        set({
          user,
          isLoggedIn: true,
          theme: user.theme || 'dark',
          friends: user.friends || [],
          bubblesEnabled: user.bubbleChatEnabled ?? true,
        });
      } catch {
        setToken(null);
        set({ user: null, isLoggedIn: false });
      } finally {
        set({ booting: false });
      }
    },

    register: async (username, email, password) => {
      const payload = await authApi.register(username, email, password);
      applyAuth(payload);
    },

    login: async (username, password) => {
      const payload = await authApi.login(username, password);
      applyAuth(payload);
    },

    logout: async () => {
      get().leaveRoom();
      try {
        await authApi.logout();
      } catch {
        /* the token is going away either way */
      }
      setToken(null);
      set({
        user: null,
        isLoggedIn: false,
        rooms: [],
        favoriteRooms: [],
        currentRoom: null,
        friends: [],
      });
    },

    refreshUser: async () => {
      const user = await authApi.me();
      set({ user, friends: user.friends || [] });
    },

    updateProfile: async (data) => {
      const user = await authApi.updateMe(data);
      applyAppearance(user);
      set({ user, friends: user.friends || [] });
      if (user.theme && user.theme !== get().theme) {
        applyTheme(user.theme);
        set({ theme: user.theme });
      }
      if (typeof user.bubbleChatEnabled === 'boolean') {
        set({ bubblesEnabled: user.bubbleChatEnabled });
      }
    },

    setTheme: (next) => {
      if (!VALID_THEMES.includes(next) || next === get().theme) return;
      applyTheme(next);
      applyAppearance({ ...(get().user || {}), theme: next });
      set({ theme: next });
      if (get().isLoggedIn) {
        authApi.updateMe({ theme: next }).catch(() => undefined);
      }
    },

    /** Cycles dark -> light -> skeuomorphic, for the one-tap header button. */
    toggleTheme: () => {
      const order: Theme[] = ['dark', 'light', 'skeu'];
      const next = order[(order.indexOf(get().theme) + 1) % order.length];
      get().setTheme(next);
    },

    /* ---------------- dashboard ---------------- */
    loadRooms: async (params = {}) => {
      set({ roomsLoading: true });
      try {
        const data = await roomsApi.list(params);
        const rooms: Room[] = data.results || [];
        set({
          rooms,
          favoriteRooms: rooms.filter((r) => r.isFavorite).map((r) => r.id),
          roomsLoading: false,
        });
      } catch (err) {
        set({
          roomsLoading: false,
          error: err instanceof ApiError ? err.message : 'Could not load rooms.',
        });
      }
    },

    createRoom: async (name, description) => {
      const room: Room = await roomsApi.create(name, description);
      set((s) => ({ rooms: [room, ...s.rooms] }));
      return room;
    },

    deleteRoom: async (roomId) => {
      await roomsApi.remove(roomId);
      set((s) => ({ rooms: s.rooms.filter((r) => r.id !== roomId) }));
    },

    toggleFavoriteRoom: async (roomId) => {
      // optimistic — the server answer just confirms it
      set((s) => ({
        favoriteRooms: s.favoriteRooms.includes(roomId)
          ? s.favoriteRooms.filter((id) => id !== roomId)
          : [...s.favoriteRooms, roomId],
      }));
      try {
        const data = await roomsApi.favorite(roomId);
        set((s) => ({
          favoriteRooms: data.isFavorite
            ? Array.from(new Set([...s.favoriteRooms, roomId]))
            : s.favoriteRooms.filter((id) => id !== roomId),
          rooms: s.rooms.map((r) =>
            r.id === roomId ? { ...r, isFavorite: data.isFavorite } : r,
          ),
        }));
      } catch {
        set((s) => ({
          favoriteRooms: s.favoriteRooms.includes(roomId)
            ? s.favoriteRooms.filter((id) => id !== roomId)
            : [...s.favoriteRooms, roomId],
        }));
      }
    },

    /* ---------------- room session ---------------- */
    enterRoom: async (roomId) => {
      const existing = get().socket;
      if (existing) existing.close();

      // Every entry gets a ticket. React can mount this page twice (strict
      // mode, fast refresh, a quick back-and-forward) and without this the
      // slower of the two attempts would leave a second socket open — which
      // showed up as every chat message arriving twice.
      const ticket = ++enterTicket;

      // REST first so the page can paint before the socket handshake lands.
      try {
        const state = await roomsApi.detail(roomId);
        const meId = get().user?.id || '';
        set({
          currentRoom: state.room,
          roomAvatars: (state.presences as RoomAvatar[]).map((p) => ({
            ...p,
            isCurrentUser: p.id === meId,
          })),
          roomChat: state.messages,
          roomQueue: state.queue,
          djs: state.djs || [],
          playback: { ...state.playback, receivedAt: Date.now() },
          bubbleMessages: {},
          chatOpen: false,
          queueOpen: false,
        });
      } catch (err) {
        set({ error: err instanceof ApiError ? err.message : 'Could not open room.' });
        throw err;
      }

      if (ticket !== enterTicket) return; // a newer entry already took over

      const socket = new RoomSocket(roomId, (event) => {
        if (ticket !== enterTicket) return;
        handleEvent(event);
      }, (connected) => {
        if (ticket === enterTicket) set({ connected });
      });
      socket.connect();
      if (ticket !== enterTicket) {
        socket.close();
        return;
      }
      set({ socket });
    },

    leaveRoom: () => {
      enterTicket += 1;
      get().socket?.close();
      set({
        socket: null,
        connected: false,
        currentRoom: null,
        roomAvatars: [],
        roomChat: [],
        roomQueue: [],
        djs: [],
        bubbleMessages: {},
        playback: emptyPlayback,
        chatOpen: false,
        queueOpen: false,
      });
    },

    /* ---------------- ui ---------------- */
    toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen, queueOpen: false })),
    toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen, chatOpen: false })),
    toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
    setBubblesEnabled: (on) => set({ bubblesEnabled: on }),
    setError: (message) => set({ error: message }),

    /* ---------------- chat ---------------- */
    sendChatMessage: (text, type = 'text', gifUrl) => {
      get().socket?.send('chat', type === 'gif' ? { gifUrl } : { text });
    },
    editMessage: (id, text) => {
      get().socket?.send('chat_edit', { id, text });
    },
    deleteMessage: (id) => {
      get().socket?.send('chat_delete', { id });
    },
    addReaction: (id, emoji) => {
      get().socket?.send('reaction', { id, emoji });
    },

    /* ---------------- queue ---------------- */
    addToQueue: (item) => {
      get().socket?.send('queue_add', item);
    },
    removeFromQueue: (id) => {
      get().socket?.send('queue_remove', { id });
    },
    reorderQueue: (fromIdx, toIdx) => {
      const queue = [...get().roomQueue];
      if (fromIdx < 0 || fromIdx >= queue.length) return;
      const [moved] = queue.splice(fromIdx, 1);
      queue.splice(toIdx, 0, moved);
      set({ roomQueue: queue }); // optimistic; server echoes the final order
      get().socket?.send('queue_reorder', { order: queue.map((q) => q.id) });
    },
    playNext: () => {
      get().socket?.send('playback_skip', {});
    },
    syncPlayback: () => {
      get().socket?.send('sync', {});
    },

    /**
     * The server sends its position plus the moment it sent it; we extrapolate
     * from there with the local clock. That's what keeps every client on the
     * same second even if one of them paused or joined late.
     */
    getPlaybackPosition: () => {
      const { playback } = get();
      if (!playback.current) return 0;
      if (!playback.isPlaying) return playback.position;
      return playback.position + (Date.now() - playback.receivedAt) / 1000;
    },

    /* ---------------- DJ line ---------------- */
    joinLine: () => {
      get().socket?.send('dj_join', {});
    },
    leaveLine: () => {
      get().socket?.send('dj_leave', {});
    },
    kickFromLine: (userId) => {
      get().socket?.send('dj_kick', { userId });
    },
    reorderLine: (fromIdx, toIdx) => {
      const line = [...get().djs];
      if (fromIdx < 0 || fromIdx >= line.length) return;
      const [moved] = line.splice(fromIdx, 1);
      line.splice(toIdx, 0, moved);
      set({ djs: line }); // optimistic; the server echoes the final order
      get().socket?.send('dj_reorder', { order: line.map((d) => d.id) });
    },

    /* ---------------- lobby ---------------- */

    triggerLikeEffect: () => {
      const me = get().user;
      if (!me) return;
      const expression = (me.likeEffect || 'happy') as Expression;
      get().socket?.send('expression', { expression });
      set((s) => ({
        roomAvatars: s.roomAvatars.map((a) =>
          a.id === me.id ? { ...a, expression } : a,
        ),
      }));
      setTimeout(() => {
        get().socket?.send('expression', { expression: 'neutral' });
        set((s) => ({
          roomAvatars: s.roomAvatars.map((a) =>
            a.id === me.id ? { ...a, expression: 'neutral' } : a,
          ),
        }));
      }, 3000);
    },

    toggleSongFeedback: async (kind) => {
      const { playback, currentRoom } = get();
      const song = playback.current;
      if (!song) return;
      try {
        const data = await feedbackApi.toggle({
          videoId: song.videoId,
          kind,
          roomId: currentRoom?.id,
          title: song.title,
          thumbnail: song.thumbnail,
        });
        const key =
          kind === 'save' ? 'savedSongs' : kind === 'like' ? 'likedSongs' : 'dislikedSongs';
        set((s) => {
          const list = s[key] as string[];
          const next = data.active
            ? Array.from(new Set([...list, song.videoId]))
            : list.filter((id) => id !== song.videoId);
          const patch: any = { [key]: next };
          if (kind === 'like' && data.active) {
            patch.dislikedSongs = s.dislikedSongs.filter((id) => id !== song.videoId);
          }
          if (kind === 'dislike' && data.active) {
            patch.likedSongs = s.likedSongs.filter((id) => id !== song.videoId);
          }
          return patch;
        });
        if (kind === 'like' && data.active) get().triggerLikeEffect();
      } catch (err) {
        set({ error: err instanceof ApiError ? err.message : 'Could not save that.' });
      }
    },

    /* ---------------- friends ---------------- */
    addFriend: async (userId) => {
      set((s) => ({ friends: Array.from(new Set([...s.friends, userId])) }));
      try {
        await authApi.addFriend(userId);
      } catch {
        set((s) => ({ friends: s.friends.filter((id) => id !== userId) }));
      }
    },

    removeFriend: async (userId) => {
      set((s) => ({ friends: s.friends.filter((id) => id !== userId) }));
      try {
        await authApi.removeFriend(userId);
      } catch {
        set((s) => ({ friends: Array.from(new Set([...s.friends, userId])) }));
      }
    },
  };
});
