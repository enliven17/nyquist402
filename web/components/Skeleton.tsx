import type { CSSProperties } from "react";

/** A shimmering placeholder block; size it like the content it stands in for. */
export function Sk({ w = "100%", h = 14, inline, style }: { w?: number | string; h?: number | string; inline?: boolean; style?: CSSProperties }) {
  return <span aria-hidden className={inline ? "sk sk-inline" : "sk"} style={{ width: w, height: h, ...style }} />;
}
