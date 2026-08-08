import { Link } from "react-router-dom";

// ---------------------------------------------------------------------------
// Home page — Build3 Blender viewer entry point
// ---------------------------------------------------------------------------

export default function Home() {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center gap-6 bg-surface-primary text-text-primary">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold tracking-wide">Build3</h1>
        <p className="text-sm text-text-muted">Blender 3D Viewer</p>
      </div>

      <Link
        to="/projects"
        className="
          inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
          border border-border bg-surface-secondary
          hover:bg-surface-tertiary active:bg-surface-tertiary
          transition-colors duration-150 text-sm font-medium
        "
      >
        Open Project
      </Link>
    </div>
  );
}
