/**
 * The vibe avatars.
 *
 * Hand-drawn chibi sprites in the style of a 2D game character select: big
 * head, small body, thick outlines, soft shading. They're SVG, so they stay
 * crisp at any size — a 28px sidebar face and a 150px lobby sprite come out of
 * the same file with no pixelation.
 *
 * Eight skins, each with its own hair, outfit and palette, picked by the
 * number stored on the user record.
 */

import React, { useId } from 'react';

interface Palette {
  skin: string;
  skinShade: string;
  hair: string;
  hairLight: string;
  jacket: string;
  jacketDark: string;
  trim: string;
  bottom: string;
  shoes: string;
  eye: string;
}

export const SKINS: Palette[] = [
  // 0 — orange spiky hair, white/blue school jacket (the house style)
  { skin: '#ffd9bd', skinShade: '#f0b590', hair: '#ff8b1f', hairLight: '#ffb457', jacket: '#f4f6fb', jacketDark: '#d5dbe8', trim: '#ff8b1f', bottom: '#2f5fbf', shoes: '#e03b3b', eye: '#6b3a1e' },
  // 1 — black bob, red jacket
  { skin: '#f6c9a2', skinShade: '#e0aa80', hair: '#241d28', hairLight: '#4a3e52', jacket: '#e8453c', jacketDark: '#bb2f28', trim: '#ffd85e', bottom: '#20222e', shoes: '#f4f6fb', eye: '#2a2a3a' },
  // 2 — deep brown coils, green hoodie
  { skin: '#8d5524', skinShade: '#6f4019', hair: '#1a1214', hairLight: '#3a2a2e', jacket: '#27b26a', jacketDark: '#1c8a51', trim: '#d8f5e4', bottom: '#243a2e', shoes: '#f0d24a', eye: '#3a2318' },
  // 3 — blonde ponytail, violet jacket
  { skin: '#ffe0c2', skinShade: '#f0bf98', hair: '#f2c14e', hairLight: '#ffdb8a', jacket: '#9b5bf0', jacketDark: '#7a3fd0', trim: '#e9dcff', bottom: '#332a4a', shoes: '#2a2a3a', eye: '#4a6fa8' },
  // 4 — teal side-cut, charcoal bomber
  { skin: '#e3b088', skinShade: '#c8906a', hair: '#1fc8c8', hairLight: '#66e6e6', jacket: '#3a3f52', jacketDark: '#262a38', trim: '#1fc8c8', bottom: '#1c1f2a', shoes: '#e8e8f0', eye: '#2f4858' },
  // 5 — white long hair, orange puffer
  { skin: '#6b3a2a', skinShade: '#52291d', hair: '#eef0f6', hairLight: '#ffffff', jacket: '#ff7a33', jacketDark: '#d95a1c', trim: '#ffd0ad', bottom: '#2b2f45', shoes: '#1c1c24', eye: '#3a2318' },
  // 6 — crimson twin buns, pink cardigan
  { skin: '#ffe5d0', skinShade: '#f2c2a4', hair: '#d6314b', hairLight: '#f26b80', jacket: '#ff9fc4', jacketDark: '#e0769f', trim: '#fff2f7', bottom: '#4a2a3a', shoes: '#d6314b', eye: '#7a3a4a' },
  // 7 — chestnut waves, mustard coat
  { skin: '#c68642', skinShade: '#a56a30', hair: '#5a3220', hairLight: '#82502f', jacket: '#f0c02c', jacketDark: '#c99a13', trim: '#3a2a12', bottom: '#2f3a20', shoes: '#4a3218', eye: '#4a2c14' },
];

export type Expression = 'neutral' | 'happy' | 'surprised' | 'bop';

interface AvatarSpriteProps {
  skin?: number;
  expression?: Expression;
  /** Rendered height in px. Width follows the 120:170 aspect ratio. */
  size?: number;
  showBop?: boolean;
  className?: string;
  /** Draws just the head, for chat lines and compact lists. */
  faceOnly?: boolean;
}

export const AvatarSprite: React.FC<AvatarSpriteProps> = ({
  skin = 0,
  expression = 'neutral',
  size = 48,
  showBop = false,
  className = '',
  faceOnly = false,
}) => {
  const c = SKINS[((skin % SKINS.length) + SKINS.length) % SKINS.length];
  const style = ((skin % SKINS.length) + SKINS.length) % SKINS.length;
  const uid = useId().replace(/:/g, '');

  const ink = 'rgba(28,20,34,0.82)';
  const bopping = showBop && expression === 'bop';

  /* Eyes ---------------------------------------------------------------- */
  const eyes = (() => {
    if (expression === 'happy') {
      return (
        <g stroke={ink} strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d="M39 62q6-8 12 0" />
          <path d="M69 62q6-8 12 0" />
        </g>
      );
    }
    const rx = expression === 'surprised' ? 8.2 : 7.4;
    const ry = expression === 'surprised' ? 10.5 : 9;
    const pupil = expression === 'surprised' ? 3.4 : 4.4;
    return (
      <g>
        {[45, 75].map((cx) => (
          <g key={cx}>
            <ellipse cx={cx} cy={62} rx={rx} ry={ry} fill="#ffffff" stroke={ink} strokeWidth="1.6" />
            <ellipse cx={cx} cy={63} rx={pupil + 1.4} ry={pupil + 2} fill={c.eye} />
            <ellipse cx={cx} cy={64} rx={pupil - 1} ry={pupil - 0.4} fill="#120d18" />
            <circle cx={cx - 2.2} cy={59.5} r="2.1" fill="#ffffff" />
            <circle cx={cx + 2.4} cy={66} r="1.1" fill="#ffffff" opacity="0.75" />
          </g>
        ))}
      </g>
    );
  })();

  const mouth = (() => {
    if (expression === 'happy') {
      return <path d="M52 78q8 9 16 0q-8 4-16 0Z" fill="#c2485c" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />;
    }
    if (expression === 'surprised') {
      return <ellipse cx="60" cy="79" rx="5.6" ry="6.4" fill="#b84057" stroke={ink} strokeWidth="1.6" />;
    }
    return <path d="M54 78q6 4 12 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  })();

  const brows = (
    <g stroke={c.hair} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.9">
      {expression === 'surprised' ? (
        <>
          <path d="M37 45q7-4 14-1" />
          <path d="M69 44q7-3 14 1" />
        </>
      ) : (
        <>
          <path d="M38 48q7-4 13-1" />
          <path d="M69 47q6-3 13 1" />
        </>
      )}
    </g>
  );

  /* Hair, front layer, one per skin -------------------------------------- */
  const hairFront = (() => {
    switch (style) {
      case 0: // spiky fringe
        return (
          <path
            d="M22 52c-1-19 15-32 38-32s38 12 37 31c-2-6-6-11-9-13l2 10-8-10-1 9-7-9-4 8-4-9-6 9-4-8-6 8-3-8-8 9-2-8c-4 3-8 8-10 13Z"
            fill={`url(#hair${uid})`}
            stroke={ink}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        );
      case 1: // blunt bob
        return (
          <path d="M20 56c0-22 16-36 40-36s40 14 40 36l-6-2 1-12c-9 8-22 11-35 11s-25-3-33-11l1 12Z" fill={`url(#hair${uid})`} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        );
      case 2: // coils
        return (
          <g fill={`url(#hair${uid})`} stroke={ink} strokeWidth="1.4">
            <path d="M22 54c0-22 16-35 38-35s38 13 38 35c-6-12-20-18-38-18s-32 6-38 18Z" strokeLinejoin="round" />
            {[26, 38, 50, 62, 74, 86, 96].map((x, i) => (
              <circle key={x} cx={x} cy={i % 2 ? 26 : 31} r="9" />
            ))}
          </g>
        );
      case 3: // side-part + ponytail (tail drawn in the back layer)
        return (
          <path d="M20 54c0-22 17-35 40-35s40 13 40 35l-5-3c-2-9-6-14-10-16-6 8-24 14-44 11l-3 8Z" fill={`url(#hair${uid})`} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        );
      case 4: // undercut swoosh
        return (
          <path d="M20 52c2-21 18-33 40-33s38 12 40 31c-10-10-22-14-36-13 6 4 9 9 9 14-8-9-32-9-45 3Z" fill={`url(#hair${uid})`} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        );
      case 5: // long centre part
        return (
          <path d="M20 58c0-24 17-39 40-39s40 15 40 39l-7-4c-1-11-4-18-8-21-5 9-11 13-25 13s-20-4-25-13c-4 3-7 10-8 21Z" fill={`url(#hair${uid})`} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        );
      case 6: // buns + fringe
        return (
          <g fill={`url(#hair${uid})`} stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
            <circle cx="20" cy="30" r="13" />
            <circle cx="100" cy="30" r="13" />
            <path d="M21 54c0-22 16-35 39-35s39 13 39 35l-6-3-2-11-8 10-3-9-8 9-4-9-7 9-5-9-8 9-3-9-8 10Z" />
          </g>
        );
      default: // 7 — soft waves
        return (
          <path d="M20 56c0-23 17-37 40-37s40 14 40 37l-6-4c-3-8-7-13-12-15-5 7-13 10-24 10s-18-3-23-10c-5 2-10 7-13 15Z" fill={`url(#hair${uid})`} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        );
    }
  })();

  const hairBack = (
    <g>
      <ellipse cx="60" cy="56" rx="42" ry="40" fill={c.hair} stroke={ink} strokeWidth="1.6" />
      {style === 3 && (
        <path d="M96 44c16 4 22 20 18 36-2 8-8 12-14 10 8-14 6-32-4-46Z" fill={c.hair} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
      )}
      {style === 5 && (
        <path d="M18 56c-4 22 0 38 6 46h8c-6-14-8-30-6-46Zm84 0c4 22 0 38-6 46h-8c6-14 8-30 6-46Z" fill={c.hair} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
      )}
    </g>
  );

  const head = (
    <g>
      {hairBack}
      {/* ears */}
      <ellipse cx="20" cy="64" rx="6.5" ry="9" fill={c.skin} stroke={ink} strokeWidth="1.6" />
      <ellipse cx="100" cy="64" rx="6.5" ry="9" fill={c.skin} stroke={ink} strokeWidth="1.6" />
      {/* face */}
      <path
        d="M24 52c0-18 16-30 36-30s36 12 36 30c0 24-16 40-36 40S24 76 24 52Z"
        fill={`url(#face${uid})`}
        stroke={ink}
        strokeWidth="1.8"
      />
      {expression !== 'surprised' && (
        <>
          <ellipse cx="34" cy="71" rx="7" ry="4.2" fill="#ff8a9c" opacity="0.38" />
          <ellipse cx="86" cy="71" rx="7" ry="4.2" fill="#ff8a9c" opacity="0.38" />
        </>
      )}
      {brows}
      {eyes}
      {mouth}
      {hairFront}
    </g>
  );

  const defs = (
    <defs>
      <linearGradient id={`face${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={c.skin} />
        <stop offset="100%" stopColor={c.skinShade} />
      </linearGradient>
      <linearGradient id={`hair${uid}`} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor={c.hairLight} />
        <stop offset="100%" stopColor={c.hair} />
      </linearGradient>
      <linearGradient id={`jacket${uid}`} x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stopColor={c.jacket} />
        <stop offset="100%" stopColor={c.jacketDark} />
      </linearGradient>
    </defs>
  );

  if (faceOnly) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="10 12 100 88"
        className={className}
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
      >
        {defs}
        {head}
      </svg>
    );
  }

  return (
    <svg
      width={size * (120 / 170)}
      height={size}
      viewBox="0 0 120 170"
      className={`${bopping ? 'avatar-bop' : ''} ${className}`.trim()}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
    >
      {defs}

      {/* ground shadow */}
      <ellipse cx="60" cy="165" rx="30" ry="5.5" fill="rgba(0,0,0,0.22)" />

      {/* legs + shoes */}
      <g stroke={ink} strokeWidth="1.8">
        <rect x="45" y="128" width="12" height="26" rx="6" fill={c.skinShade} />
        <rect x="63" y="128" width="12" height="26" rx="6" fill={c.skinShade} />
        <path d="M43 150h15v8a3 3 0 0 1-3 3H43a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z" fill={c.shoes} />
        <path d="M62 150h15a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H65a3 3 0 0 1-3-3Z" fill={c.shoes} />
      </g>

      {/* bottoms */}
      <path d="M40 124h40l6 16a2 2 0 0 1-2 2.6H36a2 2 0 0 1-2-2.6Z" fill={c.bottom} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />

      {/* torso */}
      <path
        d="M42 96h36a10 10 0 0 1 10 10v22a4 4 0 0 1-4 4H36a4 4 0 0 1-4-4v-22a10 10 0 0 1 10-10Z"
        fill={`url(#jacket${uid})`}
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* collar + placket */}
      <path d="M50 96h20l-10 14Z" fill={c.trim} stroke={ink} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M60 110v22" stroke={c.trim} strokeWidth="3" strokeLinecap="round" />
      <path d="M32 126h56" stroke={c.trim} strokeWidth="3.5" strokeLinecap="round" opacity="0.85" />

      {/* arms */}
      <g stroke={ink} strokeWidth="1.8">
        <rect x="20" y="99" width="14" height="30" rx="7" fill={`url(#jacket${uid})`} />
        <rect x="86" y="99" width="14" height="30" rx="7" fill={`url(#jacket${uid})`} />
        <circle cx="27" cy="132" r="7" fill={c.skin} />
        <circle cx="93" cy="132" r="7" fill={c.skin} />
      </g>

      {/* neck */}
      <rect x="52" y="86" width="16" height="14" rx="5" fill={c.skinShade} stroke={ink} strokeWidth="1.6" />

      {head}
    </svg>
  );
};

export default AvatarSprite;
