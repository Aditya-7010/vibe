/**
 * The whole app's iconography.
 *
 * Every icon is a stroked SVG drawn on a 24×24 grid that inherits
 * `currentColor`, so it picks up whatever text colour it sits in and looks the
 * same across the dark, light and skeuomorphic themes. Nothing here is an
 * emoji — emoji render differently on every platform and made the UI look
 * like a chat window rather than a product.
 */

import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  /** Fill the shape instead of stroking it (used for active/toggled states). */
  filled?: boolean;
}

function Svg({ size = 18, filled, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- */
/* Brand                                                             */
/* ---------------------------------------------------------------- */

export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="vibe-logo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--primary)" />
        <stop offset="100%" stopColor="var(--accent)" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#vibe-logo)" opacity="0.18" />
    <rect
      x="1"
      y="1"
      width="30"
      height="30"
      rx="9"
      stroke="url(#vibe-logo)"
      strokeWidth="1.5"
      fill="none"
      opacity="0.5"
    />
    <path
      d="M11 21.5V11.2l9-2.7v10.2"
      stroke="url(#vibe-logo)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx="9" cy="21.5" r="2.7" fill="url(#vibe-logo)" />
    <circle cx="18" cy="18.7" r="2.7" fill="url(#vibe-logo)" />
  </svg>
);

/* ---------------------------------------------------------------- */
/* Navigation & chrome                                               */
/* ---------------------------------------------------------------- */

export const ArrowLeft = (p: IconProps) => (
  <Svg {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Svg>
);

export const ArrowRight = (p: IconProps) => (
  <Svg {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Svg>
);

export const ChevronUp = (p: IconProps) => <Svg {...p}><path d="m6 15 6-6 6 6" /></Svg>;
export const ChevronDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;

export const Close = (p: IconProps) => (
  <Svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>
);

export const Plus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>
);

export const Check = (p: IconProps) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;

export const Search = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Svg>
);

export const Settings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.46V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9.1 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.06 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.46V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.46 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.5Z" />
  </Svg>
);

export const User = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Svg>
);

export const Users = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.5 21v-1a5.5 5.5 0 0 1 5.5-5.5h2A5.5 5.5 0 0 1 15.5 20v1" />
    <path d="M17 4.6a3.4 3.4 0 0 1 0 6.6" />
    <path d="M18 14.7a5.5 5.5 0 0 1 3.5 5.1V21" />
  </Svg>
);

export const Exit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
    <path d="m17 15 4-3-4-3" />
    <path d="M21 12H10" />
  </Svg>
);

export const Grip = (p: IconProps) => (
  <Svg {...p} filled>
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </Svg>
);

export const Dots = (p: IconProps) => (
  <Svg {...p} filled>
    <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
  </Svg>
);

/* ---------------------------------------------------------------- */
/* Themes                                                            */
/* ---------------------------------------------------------------- */

export const Moon = (p: IconProps) => (
  <Svg {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></Svg>
);

export const Sun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

/** Layered/beveled panels — stands in for the skeuomorphic theme. */
export const Layers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
    <path d="m3 12.5 9 4.5 9-4.5" />
    <path d="m3 17 9 4.5 9-4.5" />
  </Svg>
);

/* ---------------------------------------------------------------- */
/* Room                                                              */
/* ---------------------------------------------------------------- */

export const Play = (p: IconProps) => <Svg {...p} filled><path d="M7 4.5v15l12-7.5Z" /></Svg>;

export const Pause = (p: IconProps) => (
  <Svg {...p} filled><rect x="6" y="4.5" width="4" height="15" rx="1.2" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" /></Svg>
);

export const SkipNext = (p: IconProps) => (
  <Svg {...p} filled><path d="M5 5.5v13l9-6.5Z" /><rect x="16" y="5" width="3" height="14" rx="1.2" /></Svg>
);

export const Volume = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19Z" />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18.2 6.5a8 8 0 0 1 0 11" />
  </Svg>
);

export const VolumeMute = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19Z" />
    <path d="m16 10 5 4M21 10l-5 4" />
  </Svg>
);

export const Sync = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 11a8.5 8.5 0 0 0-15-4.3" />
    <path d="M3.5 13a8.5 8.5 0 0 0 15 4.3" />
    <path d="M5 3v4h4M19 21v-4h-4" />
  </Svg>
);

export const Chat = (p: IconProps) => (
  <Svg {...p}><path d="M20 4H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 16h3v4l4.5-4H20a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 20 4Z" /></Svg>
);

export const Send = (p: IconProps) => (
  <Svg {...p}><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5Z" /></Svg>
);

export const QueueList = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h11M4 12h11M4 17h7" />
    <circle cx="18.5" cy="17" r="2.5" />
    <path d="M21 17V9.5l-4 1" />
  </Svg>
);

export const Music = (p: IconProps) => (
  <Svg {...p}><path d="M9 18V6.5l11-2.5V16" /><circle cx="6.5" cy="18" r="2.8" /><circle cx="17.2" cy="16" r="2.8" /></Svg>
);

export const Disc = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.6" /><path d="M12 3a9 9 0 0 1 8.4 5.8" /></Svg>
);

export const Video = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="5.5" width="14" height="13" rx="2.5" /><path d="m16.5 10.5 5-3v9l-5-3Z" /></Svg>
);

export const Heart = (p: IconProps) => (
  <Svg {...p}><path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" /></Svg>
);

export const ThumbUp = (p: IconProps) => (
  <Svg {...p}><path d="M7 10.5 11 3a2.5 2.5 0 0 1 2.5 2.5V9h4.6a2 2 0 0 1 2 2.4l-1.3 6a2 2 0 0 1-2 1.6H7Z" /><rect x="2.5" y="10.5" width="4.5" height="8.5" rx="1.4" /></Svg>
);

export const ThumbDown = (p: IconProps) => (
  <Svg {...p}><path d="M7 13.5 11 21a2.5 2.5 0 0 0 2.5-2.5V15h4.6a2 2 0 0 0 2-2.4l-1.3-6a2 2 0 0 0-2-1.6H7Z" /><rect x="2.5" y="5" width="4.5" height="8.5" rx="1.4" /></Svg>
);

export const Bookmark = (p: IconProps) => (
  <Svg {...p}><path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4-6.5 4V4.5a1 1 0 0 1 1-1Z" /></Svg>
);

export const Star = (p: IconProps) => (
  <Svg {...p}><path d="m12 3.5 2.7 5.6 6.1.85-4.4 4.3 1 6.1L12 17.5l-5.4 2.85 1-6.1-4.4-4.3 6.1-.85Z" /></Svg>
);

export const Gif = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M10.4 10.2a2.2 2.2 0 1 0 .3 3.6v-1.3H9.5" />
    <path d="M13.6 10v4" />
    <path d="M16.2 14v-4h2.6M16.2 12.2h2.1" />
  </Svg>
);

export const Trash = (p: IconProps) => (
  <Svg {...p}><path d="M4 7h16" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" /></Svg>
);

export const Edit = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 6 3 3" /></Svg>
);

export const Smile = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4.2 4.2 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.4" /></Svg>
);

export const Headphones = (p: IconProps) => (
  <Svg {...p}><path d="M4 15v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="14" width="4.5" height="6.5" rx="2" /><rect x="17" y="14" width="4.5" height="6.5" rx="2" /></Svg>
);

export const Live = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" style={{ flexShrink: 0 }}>
    <circle cx="5" cy="5" r="4" fill="currentColor" opacity="0.25" />
    <circle cx="5" cy="5" r="2.2" fill="currentColor" />
  </svg>
);

export const Accessibility = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="4.6" r="1.8" /><path d="M5 8.5h14" /><path d="M12 8.5v6" /><path d="m9 21 3-6.5 3 6.5" /></Svg>
);

export const Info = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.7h.01" strokeWidth="2.4" /></Svg>
);

export const Shield = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6Z" /></Svg>
);

export const Mail = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></Svg>
);

export const Lock = (p: IconProps) => (
  <Svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" /></Svg>
);

export const Palette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 0 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z" />
    <path d="M7.5 11h.01M10 7.6h.01M14.4 7.6h.01" strokeWidth="2.4" />
  </Svg>
);

export const Deck = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 12 17 8" />
  </Svg>
);
