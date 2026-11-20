import { useEffect, useId, useState } from "react";

/** Animated Shopmate bag mark. Pure SVG + CSS (see .bagmark in styles.css). */
export function BagMark({ size = 28, still = false }: { size?: number; still?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [drop, setDrop] = useState(0);
  useEffect(() => {
    if (still) return;
    const on = () => setDrop((n) => n + 1);
    window.addEventListener("sm-cart-add", on);
    return () => window.removeEventListener("sm-cart-add", on);
  }, [still]);
  return (
    <span className={`bagmark${still ? " still" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="bm-tilt" key={drop} data-drop={drop > 0 ? "1" : undefined}>
        <svg viewBox="0 0 64 64" width={size} height={size}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFB547" />
              <stop offset="1" stopColor="#FF6A33" />
            </linearGradient>
            <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`c${id}`}><rect width="64" height="64" rx="15" /></clipPath>
          </defs>
          <rect width="64" height="64" rx="15" fill={`url(#g${id})`} />
          <g clipPath={`url(#c${id})`}>
            <rect className="bm-sheen" x="-40" y="-10" width="26" height="84" fill={`url(#s${id})`} transform="skewX(-18)" />
          </g>
          <rect className="bm-item" x="27" y="8" width="10" height="10" rx="2.5" fill="#fff" opacity="0" />
          <path className="bm-body" d="M17 25h30l-2.6 25.2a3.5 3.5 0 0 1-3.5 3.1H23.1a3.5 3.5 0 0 1-3.5-3.1z" fill="#fff" />
          <path className="bm-handle" d="M25 27v-5a7 7 0 0 1 14 0v5" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" pathLength={1} />
          <path d="M25.5 33.5a6.5 6.5 0 0 0 13 0" fill="none" stroke="#FF8A3C" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </span>
      {!still && (
        <span className="bm-sparks">
          <i /><i /><i />
        </span>
      )}
    </span>
  );
}
