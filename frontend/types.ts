export type LikeEffect = 'happy' | 'surprised' | 'bop';
export type Expression = 'neutral' | 'happy' | 'surprised' | 'bop';
export type Theme = 'dark' | 'light' | 'skeu';

export interface User {
  id: string;
  username: string;
  email: string;
  avatarSkin: number;
  likeEffect: LikeEffect;
  theme: Theme;
  accentColor: string;
  fontSize: string;
  animationsEnabled: boolean;
  bubbleChatEnabled: boolean;
  emailVerified: boolean;
  pendingEmail: string;
  friends: string[];
}

export interface Room {
  id: string;
  name: string;
  slug: string;
  description: string;
  artUrl: string;
  isActive: boolean;
  memberCount: number;
  ownerId: string;
  ownerName: string;
  isFavorite: boolean;
  canModerate: boolean;
  createdAt: number;
}

export interface ReplyPreview {
  id: string;
  username: string;
  text: string;
  deleted?: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatarSkin: number;
  text: string;
  type: 'text' | 'gif';
  gifUrl?: string;
  timestamp: number;
  edited?: boolean;
  deleted?: boolean;
  reactions?: Record<string, string[]>;
  replyTo?: ReplyPreview | null;
  canEdit?: boolean;
  canDelete?: boolean;
}

export interface FavoriteTrack {
  videoId: string;
  title: string;
  thumbnail: string;
  /** seconds */
  duration: number;
  createdAt: number;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  /** seconds */
  duration: number;
  durationText: string;
  addedBy: string;
  addedById?: string;
  position?: number;
}

export interface DJ {
  id: string;
  username: string;
  avatarSkin: number;
  position: number;
  /** how many unplayed tracks this person still has queued */
  trackCount: number;
  isCurrent: boolean;
}

export interface RoomAvatar {
  id: string;
  username: string;
  avatarSkin: number;
  x: number;
  y: number;
  expression: Expression;
  isCurrentUser: boolean;
}

export interface BubbleMessage {
  text: string;
  timestamp: number;
  exiting: boolean;
}

export interface PlaybackState {
  revision: number;
  /** the user whose queue the current track came from */
  djId: string;
  isPlaying: boolean;
  /** server-reported position in seconds at the moment the frame was sent */
  position: number;
  serverTime: number;
  startedAt: number;
  current: QueueItem | null;
  /** client clock when this frame arrived, used to extrapolate the position */
  receivedAt: number;
}

export interface SearchResult {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: number;
  durationText: string;
}

export interface GifResult {
  url: string;
  preview: string;
}
