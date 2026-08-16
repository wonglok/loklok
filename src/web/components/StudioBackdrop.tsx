// ---------------------------------------------------------------------------
// StudioBackdrop — the ambient background shared by the studio's entry pages.
// A faint constellation of wireframe 3D primitives (the "assets" the product
// syncs) linked by dotted lines, over a soft tiffany light source.  Kept quiet
// enough that foreground content stays the focus.
// ---------------------------------------------------------------------------

export function StudioBackdrop() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Soft tiffany light source */}
      <div className="absolute inset-0 viewport-glow animate-glow-pulse" />

      {/* Wireframe asset constellation */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="animate-float">
          {/* ---- Constellation links ---- */}
          <g
            stroke="#81d8d0"
            strokeOpacity="0.08"
            strokeWidth="1"
            strokeDasharray="2 7"
            strokeLinecap="round"
          >
            <path d="M180 255 Q 200 420 240 560" />
            <path d="M240 560 Q 700 380 1056 140" />
            <path d="M1056 260 Q 900 700 620 745" />
          </g>

          {/* ---- Nodes ---- */}
          <g fill="#81d8d0">
            <circle cx="180" cy="255" r="3" fillOpacity="0.3" />
            <circle cx="240" cy="560" r="3" fillOpacity="0.3" />
            <circle cx="1056" cy="140" r="3" fillOpacity="0.3" />
            <circle cx="620" cy="745" r="3" fillOpacity="0.3" />
          </g>

          {/* ---- Tetrahedron (top-left) ---- */}
          <g
            stroke="#81d8d0"
            strokeOpacity="0.14"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="180" y1="90" x2="120" y2="210" />
            <line x1="180" y1="90" x2="240" y2="210" />
            <line x1="180" y1="90" x2="180" y2="255" />
            <line x1="120" y1="210" x2="240" y2="210" />
            <line x1="240" y1="210" x2="180" y2="255" />
            <line x1="180" y1="255" x2="120" y2="210" />
          </g>

          {/* ---- Sphere (left) ---- */}
          <g
            stroke="#81d8d0"
            strokeOpacity="0.15"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="240" cy="560" r="140" />
            <ellipse cx="240" cy="560" rx="65" ry="140" />
            <ellipse cx="240" cy="560" rx="140" ry="55" />
          </g>

          {/* ---- Cube (top-right) ---- */}
          <g
            stroke="#81d8d0"
            strokeOpacity="0.2"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="1160,80 1264,140 1264,260 1160,320 1056,260 1056,140" />
            <line x1="1160" y1="200" x2="1264" y2="140" />
            <line x1="1160" y1="200" x2="1264" y2="260" />
            <line x1="1160" y1="200" x2="1056" y2="260" />
          </g>
          <polygon
            points="1160,80 1264,140 1160,200"
            fill="#81d8d0"
            fillOpacity="0.05"
            stroke="none"
          />

          {/* ---- Small cube (bottom-left) ---- */}
          <g
            stroke="#81d8d0"
            strokeOpacity="0.12"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="620,715 646,730 646,760 620,775 594,760 594,730" />
            <line x1="620" y1="745" x2="646" y2="730" />
            <line x1="620" y1="745" x2="646" y2="760" />
            <line x1="620" y1="745" x2="594" y2="760" />
          </g>
        </g>
      </svg>
    </div>
  );
}
