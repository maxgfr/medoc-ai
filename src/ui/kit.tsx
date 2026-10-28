/** Small building blocks shared by the views. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

const ICONS = {
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  scan: "M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M7 12h10",
  cabinet: "M4 4h16v16H4zM4 12h16M10 8h4m-4 8h4",
  today:
    "M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "m20 20-4.5-4.5M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  plus: "M12 5v14M5 12h14",
  pill: "m10.5 20.5-7-7a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7ZM7 10l7 7",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8Zm4.3 12a2 2 0 0 0 3.4 0",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m2 5a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  doc: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M9 13h6m-6 4h6",
  calendar:
    "M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  interact: "M8 7h12m0 0-4-4m4 4-4 4M16 17H4m0 0 4 4m-4-4 4-4",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  camera:
    "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  torch: "M9 2h6v4l-2 3v13h-2V9L9 6V2Z",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "m4 20 4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3",
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
  spark:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  close: "M6 6l12 12M18 6 6 18",
  send: "M4 12 20 4l-4 16-4-7-8-1Z",
  check: "m5 12 5 5L20 7",
  download: "M12 4v12m0 0-5-5m5 5 5-5M4 20h16",
  upload: "M12 20V8m0 0-5 5m5-5 5 5M4 4h16",
  retry: "M20 12a8 8 0 1 1-2.3-5.7L20 8.6M20 3v5.6h-5.6",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-800 dark:bg-brand-500 dark:text-stone-950 dark:hover:bg-brand-400",
  secondary:
    "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800",
  ghost:
    "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white",
  danger: "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950",
};

export function Button({
  variant = "primary",
  busy = false,
  icon,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </button>
  );
}

/** A link that looks like a button (navigation, not an action). */
export function LinkButton({
  href,
  variant = "primary",
  icon,
  children,
}: {
  href: string;
  variant?: Variant;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${VARIANTS[variant]}`}
    >
      {icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </a>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-900 dark:bg-brand-900/30 dark:text-brand-100",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-100",
    error:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-100",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3 py-2 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child passed in.
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card grid justify-items-center gap-3 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
        <Icon name={icon} className="size-6" />
      </span>
      <p className="max-w-sm text-sm text-stone-600 dark:text-stone-300">{title}</p>
      {children}
    </div>
  );
}

/** A link that leaves the app. */
export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-brand-700 underline-offset-2 hover:underline dark:text-brand-400 ${className}`}
    >
      {children}
      <Icon name="external" className="size-3.5 shrink-0" />
    </a>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warn" | "danger" | "ok" | "info";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
    danger: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
    ok: "bg-brand-100 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100",
    info: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A person's colour dot and initial. */
export function Avatar({
  name,
  color,
  size = "size-7",
}: {
  name: string;
  color: string;
  size?: string;
}) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-full text-xs font-bold text-white`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Saves a file the app made (a backup, a calendar). */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
