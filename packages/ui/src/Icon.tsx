/* One icon set, one geometry.
 *
 * design-ieee.md §59: a consistent outline system, 1.5–2px stroke, rounded
 * joins, minimal detail, 16–20px default, and no arbitrary mixing of filled
 * and outlined styles. So every glyph here is drawn on the same 24-unit grid
 * with the same stroke, and the only filled variant in the file is
 * `bookmark-filled` — §78 makes a filled bookmark the saved state, which is a
 * state change rather than a second style.
 *
 * Inline rather than from an icon package: the CSP forbids third-party
 * requests, and twenty paths are smaller than any library that would ship a
 * thousand. */

export type IconName =
  | "home"
  | "explore"
  | "bookmark"
  | "bookmark-filled"
  | "applications"
  | "calendar"
  | "compare"
  | "user"
  | "search"
  | "filter"
  | "sort"
  | "chevron-down"
  | "chevron-right"
  | "chevron-left"
  | "arrow-right"
  | "arrow-down"
  | "arrow-up"
  | "close"
  | "check"
  | "plus"
  | "minus"
  | "external"
  | "alert"
  | "info"
  | "inbox"
  | "refresh"
  | "menu"
  | "clock"
  | "coins"
  | "globe"
  | "help"
  | "trash"
  | "sun"
  | "moon"
  | "monitor"
  | "upload"
  | "file"
  | "shield"
  | "sparkle"
  | "rover"
  | "bell"
  | "school"
  /* The desk's two. "list" is its index of every listing, and "pulse" its
     audit trail — neither has a counterpart on the student side, which is why
     they arrive here rather than being borrowed from a near-enough glyph. */
  | "list"
  | "pulse"
  /* Rover's opener cards name six kinds of opportunity, and a kind of thing is
     what an icon is for. Nothing else in either app names these as categories,
     which is why they arrive now rather than having been here all along. */
  | "flask"
  | "briefcase"
  | "trophy";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />,
  explore: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M14.2 7.8 12.6 12.6 7.8 14.2 9.4 9.4z" />
    </>
  ),
  bookmark: <path d="M6 4.8A.8.8 0 0 1 6.8 4h10.4a.8.8 0 0 1 .8.8V20l-6-3.6L6 20z" />,
  "bookmark-filled": (
    <path d="M6 4.8A.8.8 0 0 1 6.8 4h10.4a.8.8 0 0 1 .8.8V20l-6-3.6L6 20z" fill="currentColor" />
  ),
  applications: (
    <>
      <path d="M8 4h8a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2V5a1 1 0 0 1 1-1z" />
      <path d="M8.5 12.5 10.5 14.5 15 10" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="1.6" />
      <path d="M4 10.5h16M8.5 4v3.5M15.5 4v3.5" />
    </>
  ),
  compare: (
    <>
      <path d="M12 4v16" />
      <path d="M5 8h4.5v9H5zM14.5 11H19v6h-4.5z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="M15.4 15.4 20 20" />
    </>
  ),
  filter: <path d="M4.5 6.5h15M7.5 12h9M10.5 17.5h3" />,
  sort: <path d="M7 5v14M7 19l-2.6-2.8M7 19l2.6-2.8M17 19V5M17 5l-2.6 2.8M17 5l2.6 2.8" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  "chevron-right": <path d="m10 7 5 5-5 5" />,
  "chevron-left": <path d="m14 7-5 5 5 5" />,
  "arrow-right": <path d="M5 12h13M13 7l5 5-5 5" />,
  "arrow-down": <path d="M12 5v13M7 13l5 5 5-5" />,
  "arrow-up": <path d="M12 19V6M7 11l5-5 5 5" />,
  close: <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />,
  check: <path d="m5 12.6 4.4 4.4L19 7" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  external: (
    <>
      <path d="M13.5 5H19v5.5" />
      <path d="M19 5l-7.5 7.5" />
      <path d="M17 14.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.8 20.4 19.2H3.6z" />
      <path d="M12 10v4M12 16.8v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5.5M12 8v.2" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 12.5 6.6 5.6A1 1 0 0 1 7.5 5h9a1 1 0 0 1 .9.6L20 12.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 12.5h4l1 2.5h6l1-2.5h4" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" />
      <path d="M19.8 4.8v4h-4" />
    </>
  ),
  list: (
    <>
      <path d="M9 7h10.5M9 12h10.5M9 17h10.5" />
      <path d="M4.8 7h.01M4.8 12h.01M4.8 17h.01" />
    </>
  ),
  pulse: <path d="M3.5 12h3.8l2.2-5.4 3.4 10.8 2.3-5.4h5.3" />,

  /* Stroke-only, same 24-box and 1.6 stroke as every other glyph here, so they
     read as part of this set rather than as three imported from another. */
  flask: (
    <>
      <path d="M9.5 3.6h5" />
      <path d="M10.6 3.6v5.2L6 17.1a2 2 0 0 0 1.7 3h8.6a2 2 0 0 0 1.7-3l-4.6-8.3V3.6" />
      <path d="M8.3 14h7.4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.4" y="7.6" width="17.2" height="12" rx="2" />
      <path d="M9.1 7.6V5.9a1.3 1.3 0 0 1 1.3-1.3h3.2a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M3.4 12.6h17.2" />
    </>
  ),
  trophy: (
    <>
      <path d="M7.6 4.3h8.8v4.5a4.4 4.4 0 0 1-8.8 0z" />
      <path d="M7.6 5.7H5.2a2 2 0 0 0 0 4h.9M16.4 5.7h2.4a2 2 0 0 1 0 4h-.9" />
      <path d="M12 13.2v3.5M9.2 19.7h5.6M10.2 16.7h3.6" />
    </>
  ),
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.8V12l3 2" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="7.5" rx="7" ry="3" />
      <path d="M5 7.5v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
      <path d="M5 11.5v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8s-1.1 5.7-3.3 8c-2.2-2.3-3.3-5-3.3-8S9.8 6.3 12 4z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.6a2.2 2.2 0 1 1 3 2.1c-.5.3-.8.8-.8 1.4v.4M12 16.6v.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8 8 0 1 0 9.4 9.4z" />,
  monitor: (
    <>
      <rect x="3.5" y="5" width="17" height="11.5" rx="1.6" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5" />
      <path d="M8 8.6 12 4.6l4 4" />
      <path d="M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h6.5L18 8v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M13.2 3.6V8H18" />
    </>
  ),
  shield: <path d="M12 3.6l7 2.6v5.4c0 4-2.9 7.4-7 8.8-4.1-1.4-7-4.8-7-8.8V6.2z" />,
  sparkle: <path d="M12 4l1.7 4.6L18.4 10l-4.7 1.4L12 16l-1.7-4.6L5.6 10l4.7-1.4z" />,
  /* The mascot. A rover reads at 20px from four things and no more: a body, a
     mast, two wheels, and eyes — the eyes are what make it a character rather
     than a machine, and they are drawn the way every other dot in this file is
     (a zero-length stroke with a round cap). */
  rover: (
    <>
      <path d="M12 4.2v2.9" />
      <path d="M12 3.4v.2" />
      <rect x="4.4" y="7.8" width="15.2" height="7.4" rx="2.2" />
      <path d="M9.6 11.4v.2M14.4 11.4v.2" />
      <circle cx="8.4" cy="18.4" r="1.9" />
      <circle cx="15.6" cy="18.4" r="1.9" />
      <path d="M10.3 18.4h3.4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </>
  ),
  school: (
    <>
      <path d="M12 4.5 21 9l-9 4.5L3 9z" />
      <path d="M6.5 10.8V16c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-5.2" />
    </>
  ),
  trash: (
    <>
      <path d="M5.5 7.5h13M9.5 7.5V5.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7" />
      <path d="M7 7.5 7.8 19a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17 7.5" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.6,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: "none", ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
