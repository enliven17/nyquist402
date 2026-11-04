import { N_PATH } from "./nPath";

// Mark: a line-drawn N. Inherits the text color.
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      height={size}
      width={Math.round((size * 1842) / 2013)}
      viewBox="0 0 1842 2013"
      className={className}
      aria-hidden="true"
    >
      <path d={N_PATH} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
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
