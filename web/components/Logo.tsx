// Mark: a sampled signal under a dashed ceiling. The ceiling is the authorized hold (max_amount);
// the stems are captures, each at or below it. Sample-and-hold, the idea behind the name.
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" fill="var(--accent, #2440FF)" />
      <path d="M9 12H39" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" />
      <path d="M9 37H39M14 37V23M24 37V12M34 37V27" stroke="#fff" strokeWidth="2.5" />
      <circle cx="14" cy="23" r="3.25" fill="#fff" />
      <circle cx="24" cy="12" r="3.25" fill="#fff" />
      <circle cx="34" cy="27" r="3.25" fill="#fff" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="brand" aria-label="Nyquist402">
      <Mark size={size} />
      <span className="brand-word">
        nyquist<span className="brand-num">402</span>
      </span>
    </span>
  );
}
