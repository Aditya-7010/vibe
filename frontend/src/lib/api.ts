/**
 * Thin wrapper around the Django REST API.
 *
 * The token lives in localStorage so a refresh keeps you logged in; every
 * request attaches it as `Authorization: Token <key>`.
 */

const RAW_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const API_BASE =
  RAW_BASE ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : typeof window !== 'undefined'
      ? window.location.origin
      : '');

export const WS_BASE = API_BASE.replace(/^http/, 'ws');

const TOKEN_KEY = 'vibe.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the session just won't survive a refresh */
  }
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** Turns DRF's `{field: ["msg"]}` shape into one readable line. */
function firstError(data: any): string {
  if (!data) return 'Something went wrong.';
  if (typeof data === 'string') return data;
  if (data.detail) return String(data.detail);
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length) return String(value[0]);
    if (typeof value === 'string') return value;
  }
  return 'Something went wrong.';
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Token ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0, null);
  }

  if (response.status === 204) return undefined as T;

  let data: any = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    // A dead token means the session is over — drop it and send the person to
    // the sign-in page rather than leaving the UI in a half-logged-in state.
    if (response.status === 401 && auth && token) {
      setToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        window.location.assign('/auth');
      }
    }
    throw new ApiError(firstError(data), response.status, data);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T = any>(path: string, body?: any, auth = true) =>
    request<T>(path, { method: 'POST', body, auth }),
  patch: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body }),
  del: <T = any>(path: string, body?: any) => request<T>(path, { method: 'DELETE', body }),
};

/* ------------------------------------------------------------------ */
/* Endpoint helpers                                                    */
/* ------------------------------------------------------------------ */

export const auth = {
  register: (username: string, email: string, password: string) =>
    api.post('/auth/register/', { username, email, password }, false),
  login: (username: string, password: string) =>
    api.post('/auth/login/', { username, password }, false),
  logout: () => api.post('/auth/logout/'),
  me: () => api.get('/auth/me/'),
  updateMe: (data: Record<string, any>) => api.patch('/auth/me/', data),
  usernameAvailable: (username: string) =>
    api.get(`/auth/username-available/?username=${encodeURIComponent(username)}`),
  changeEmail: (email: string, password: string) =>
    api.post('/auth/change-email/', { email, password }),
  resendVerification: () => api.post('/auth/resend-verification/'),
  verifyEmail: (token: string) => api.post('/auth/verify-email/', { token }, false),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password/', { current_password, new_password }),
  deleteAccount: (password: string) => api.post('/auth/delete-account/', { password }),
  friends: () => api.get('/auth/friends/'),
  addFriend: (userId: string) => api.post('/auth/friends/', { userId }),
  removeFriend: (userId: string) => api.del('/auth/friends/', { userId }),
};

export const roomsApi = {
  list: (params: { q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    const qs = search.toString();
    return api.get(`/rooms/${qs ? `?${qs}` : ''}`);
  },
  create: (name: string, description: string) =>
    api.post('/rooms/', { name, description }),
  detail: (roomId: string) => api.get(`/rooms/${roomId}/`),
  remove: (roomId: string) => api.del(`/rooms/${roomId}/`),
  favorite: (roomId: string) => api.post(`/rooms/${roomId}/favorite/`),
  queue: (roomId: string) => api.get(`/rooms/${roomId}/queue/`),
};

export const searchApi = {
  youtube: (q: string, signal?: AbortSignal) =>
    api.get(`/search/youtube/?q=${encodeURIComponent(q)}`, signal),
  gifs: (q: string, signal?: AbortSignal) =>
    api.get(`/search/gifs/?q=${encodeURIComponent(q)}`, signal),
};

export const feedbackApi = {
  toggle: (payload: {
    videoId: string;
    kind: 'like' | 'dislike' | 'save';
    roomId?: string;
    title?: string;
    thumbnail?: string;
  }) => api.post('/feedback/', payload),
  saved: () => api.get('/feedback/?kind=save'),
};
