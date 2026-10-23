import type { ButtonHTMLAttributes, ReactNode, SVGProps } from "react";

export type IconName =
  | "archive"
  | "arrow-left"
  | "arrow-right"
  | "bookmark"
  | "bot"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "collection"
  | "copy"
  | "download"
  | "edit"
  | "external"
  | "file"
  | "filter"
  | "fit"
  | "graph"
  | "history"
  | "import"
  | "info"
  | "json"
  | "layout"
  | "list"
  | "menu"
  | "minus"
  | "more"
  | "plus"
  | "pin"
  | "refresh"
  | "scope"
  | "search"
  | "tag"
  | "trash"
  | "undo"
  | "upload"
  | "zoom-in"
  | "zoom-out";

const paths: Record<IconName, ReactNode> = {
  archive: <path d="M4 7.5h16M6 7.5v11h12v-11M8 4.5h8l1 3H7l1-3Zm2.5 7h3" />,
  "arrow-left": <path d="m10 6-6 6 6 6M4 12h16" />,
  "arrow-right": <path d="m14 6 6 6-6 6M4 12h16" />,
  bookmark: <path d="M6 4.5h12v16l-6-3.6-6 3.6v-16Z" />,
  bot: <path d="M6.5 8.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM12 8.5V5.5M12 3.8h.01M9.5 13.2v1.6M14.5 13.2v1.6M2.5 12.5v3M21.5 12.5v3" />,
  check: <path d="m5 12 4.2 4.2L19 6.5" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-left": <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  "chevron-right": <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  collection: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  copy: <path d="M8 8h11v12H8zM5 16H4V4h12v1" />,
  download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19.5h14" />,
  edit: <path d="m5 16.5-.8 3.3 3.3-.8L18.7 7.8a1.8 1.8 0 0 0-2.5-2.5L5 16.5Zm9.8-9.8 2.5 2.5" />,
  external: <path d="M13 5h6v6M19 5l-9 9M18 13v5.5H5.5V6H11" />,
  file: <path d="M7 3.5h7l4 4v13H7v-17Zm7 0v4h4M9.5 12h5M9.5 15.5h5" />,
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />,
  fit: <path d="M8 4H4v4m12-4h4v4M8 20H4v-4m12 4h4v-4" />,
  graph: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="m7.7 7.2 2.8 8.1m1.9 1.1 3.8-6.6M8 6.4l8 1" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  history: <path d="M4.5 11a7.5 7.5 0 1 0 2.2-5.3L4.5 8M4.5 4.5V8h3.5M12 8v4l2.8 1.7" />,
  import: <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />,
  info: <path d="M12 10.5v6M12 6.8h.01M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
  json: <path d="M8.5 4.5c-2 0-2 2-2 3.5s0 2-1.5 4c1.5 2 1.5 2.5 1.5 4s0 3.5 2 3.5M15.5 4.5c2 0 2 2 2 3.5s0 2 1.5 4c-1.5 2-1.5 2.5-1.5 4s0 3.5-2 3.5" />,
  layout: <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5zM10 7.5h4M7.5 10v4M16.5 10v4M10 16.5h4" />,
  list: <path d="M5 6.5h1M9 6.5h10M5 12h1M9 12h10M5 17.5h1M9 17.5h10" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  minus: <path d="M5 12h14" />,
  more: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth="2.8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pin: <path d="m8 4 8 0-1 5 3 3-5 1v7l-1 1-1-1v-7l-5-1 3-3-1-5Z" />,
  scope: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" />
    </>
  ),
  refresh: <path d="M19 8V4l-2.2 2.2A7.5 7.5 0 1 0 19.2 14M19 4l-3 3" />,
  search: <path d="m16.5 16.5 4 4M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" />,
  tag: <path d="M4 5v6l9 9 7-7-9-9H4Zm3.5 3.5h.01" />,
  upload: <path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v5.5h14V14" />,
  "zoom-in": <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm5-1 4.5 4.5M10.5 7.5v6m-3-3h6" />,
  "zoom-out": <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm5-1 4.5 4.5M7.5 10.5h6" />,
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.8,
  ...props
}: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

/** A keyboard shortcut shown as a key cap on the control it triggers; hidden on touch screens without a keyboard. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="key-badge" aria-hidden="true">{children}</kbd>;
}

export function IconButton({
  label,
  icon,
  size = 18,
  className = "",
  shortcut,
  ...props
}: {
  label: string;
  icon: IconName;
  size?: number;
  className?: string;
  /** The key that triggers it, shown beside the icon. */
  shortcut?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`icon-button ${shortcut ? "has-key" : ""} ${className}`}
      aria-label={label}
      title={label}
      data-tooltip={label}
      {...props}
    >
      <Icon name={icon} size={size} />
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  );
}
