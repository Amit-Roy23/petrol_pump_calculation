export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="rgb(var(--brand))" />
      <rect x="11" y="9" width="12" height="22" rx="2" fill="rgb(var(--brand-ink))" />
      <rect x="13.5" y="12" width="7" height="5" rx="1" fill="rgb(var(--brand))" />
      <path d="M23 14h3.5l2.5 3.5v9a2 2 0 0 1-4 0v-5h-2" fill="none" stroke="rgb(var(--brand-ink))" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="9" y="30" width="16" height="2.5" rx="1.25" fill="rgb(var(--brand-ink))" />
    </svg>
  );
}
