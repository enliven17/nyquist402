import { N_DIAGONAL, N_OUTER, N_PATH } from "./nPath";

// Below this height the line-drawn N blurs, so the mark switches to its outline.
const SMALL = 48;

// Mark: a line-drawn N. Inherits the text color.
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      height={size}
      width={Math.round((size * 1842) / 2013)}
      viewBox={size < SMALL ? "-110 -110 2062 2233" : "0 0 1842 2013"}
      className={className}
      aria-hidden="true"
    >
      {size < SMALL ? (
        <g fill="none" stroke="currentColor" strokeWidth={Math.min(180, Math.round((2013 / size) * 1.5))}>
          <path d={N_OUTER} strokeLinejoin="round" />
          <path d={N_DIAGONAL} />
        </g>
      ) : (
        <path d={N_PATH} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
      )}
    </svg>
  );
}

export function Logo({ size = 28, mark = true }: { size?: number; mark?: boolean }) {
  return (
    <span className="brand" aria-label="Nyquist402">
      {mark && <Mark size={size} />}
      <span className="brand-word">
        nyquist<span className="brand-num">402</span>
      </span>
    </span>
  );
}
