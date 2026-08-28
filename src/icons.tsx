// Minimal line-icon set for ScanCart. Single stroke language across every
// screen so the interface reads as one system.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const Home = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);

export const Cart = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    <circle cx="9.5" cy="20" r="1.3" />
    <circle cx="17.5" cy="20" r="1.3" />
  </svg>
);

export const Scan = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10" />
  </svg>
);

export const Close = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const More = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const Flash = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" />
  </svg>
);

export const Flame = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3c1 3-1.5 4.5-2.8 6.4A5.6 5.6 0 0 0 8 12.7 4 4 0 0 0 12 20a4.2 4.2 0 0 0 4-4.5c0-1.6-.9-2.8-1.6-3.8-.4 1-1.2 1.5-2 1.7.7-2 .5-4.2-.4-6.4Z" />
  </svg>
);

export const Card = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 9.5h18" />
    <path d="M6.5 14.5h3" />
  </svg>
);

export const Camera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h1.7l1-1.6a1 1 0 0 1 .84-.46h5.92a1 1 0 0 1 .84.46L16.8 7h1.7A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
    <circle cx="12" cy="12.5" r="3.2" />
  </svg>
);

export const Recent = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 12a8.5 8.5 0 1 1 2.7 6.2" />
    <path d="M3.5 19v-4h4" />
    <path d="M12 8v4.5l3 1.8" />
  </svg>
);

export const Info = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="7.8" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M6.5 7 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    <path d="M10 11v5.5M14 11v5.5" />
  </svg>
);

export const Back = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);

export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

export const Calendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M4 9.5h16M8 3v4M16 3v4" />
  </svg>
);

export const Alert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4 2.8 20h18.4L12 4Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Minus = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

export const Keyboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
  </svg>
);

export const CameraOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h1.7l1-1.6a1 1 0 0 1 .84-.46h4" />
    <path d="M20 15.5v-7A1.5 1.5 0 0 0 18.5 7" />
    <path d="M18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-6" />
    <path d="M3 3l18 18" />
  </svg>
);

export const Wifi = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 8.5a15 15 0 0 1 20 0" />
    <path d="M5 12a10 10 0 0 1 14 0" />
    <path d="M8.5 15.5a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19" r="0.6" fill="currentColor" stroke="none" />
    <path d="M3 3l18 18" />
  </svg>
);

// Product glyphs -----------------------------------------------------------

export const Ramen = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 11h16a8 8 0 0 1-16 0Z" />
    <path d="M2.5 20h19" />
    <path d="M9 8c0-1.2 1-1.5 1-2.6S9 4 9 4M13 8c0-1.2 1-1.5 1-2.6S13 4 13 4" />
  </svg>
);

export const Donut = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M7 8.5c.6.5 1 .2 1.6.6M15.5 9c.5.6.2 1 .6 1.6M9 16c.6-.5 1-.2 1.6-.6" />
  </svg>
);

export const Bottle = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 3h4v2.5c0 .8.4 1.2 1 1.9.7.8 1 1.6 1 2.8V19a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8.8c0-1.2.3-2 1-2.8.6-.7 1-1.1 1-1.9Z" />
    <path d="M8 12h8" />
  </svg>
);

export const productGlyph = {
  ramen: Ramen,
  donut: Donut,
  water: Bottle,
};
