export default function Welcome() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">⚡ loklok</h1>
        <p className="text-zinc-400 text-lg">AI‑Agent‑Optimized CLI</p>
        <div className="flex gap-3 justify-center mt-6">
          <a
            href="/api/health"
            className="px-4 py-2 rounded-lg text-white bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            /api/health →
          </a>
          <a
            href="/api/blender/plugin.zip"
            className="px-4 py-2 rounded-lg text-white bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
            download="plugin.zip"
          >
            Blender Plugin
          </a>
          <a
            href="/projects"
            className="px-4 py-2 rounded-lg text-white bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
          >
            Projects
          </a>
          <a
            href="/receiver"
            className="px-4 py-2 rounded-lg text-white bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
          >
            Blender ThreeJS Sync
          </a>
        </div>
      </div>
    </div>
  );
}
