import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project } from "../stores/useProjectStore";
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  PlusIcon,
  TrashIcon,
} from "../../components/Icons";

// ---------------------------------------------------------------------------
// Tiffany palette
// ---------------------------------------------------------------------------
const tiffany = {
  bg: "bg-[#f5fdfc]",
  surface: "bg-white",
  border: "border-[#c8ece8]",
  accent: "bg-[#81d8d0] hover:bg-[#6ac4bc]",
  accentText: "text-[#2fa89c]",
  heading: "text-[#1a4a45]",
  text: "text-[#2d5a55]",
  muted: "text-[#6b9e97]",
  subtle: "text-[#a3c9c3]",
  panelBg: "bg-[#f0faf8]",
  panelBorder: "border-[#d4eeea]",
  input: "bg-white border-[#c8ece8] focus:border-[#81d8d0] focus:ring-[#c8ece8]",
  hover: "hover:bg-[#e8f8f5]",
};

export function ProjectEditor() {
  const { projectID } = useParams<{ projectID: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panel resize state
  const [rightWidth, setRightWidth] = useState(280);
  const [bottomHeight, setBottomHeight] = useState(200);
  const resizing = useRef<"right" | "bottom" | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectID}`);
        if (!res.ok) throw new Error("Project not found");
        const data: Project = await res.json();
        setProject(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectID]);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (resizing.current === "right") {
        const w = window.innerWidth - e.clientX;
        setRightWidth(Math.max(200, Math.min(500, w)));
      }
      if (resizing.current === "bottom") {
        const h = window.innerHeight - e.clientY;
        setBottomHeight(Math.max(120, Math.min(400, h)));
      }
    },
    [],
  );

  const onMouseUp = useCallback(() => {
    resizing.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function startResize(dir: "right" | "bottom") {
    resizing.current = dir;
    document.body.style.cursor = dir === "right" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  // -------------------------------------------------------------------
  // Loading / Error states
  // -------------------------------------------------------------------

  if (loading) {
    return (
      <div className={`w-screen h-screen ${tiffany.bg} flex items-center justify-center`}>
        <p className={`text-sm ${tiffany.muted}`}>Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className={`w-screen h-screen ${tiffany.bg} flex items-center justify-center`}>
        <div className="text-center space-y-3">
          <p className={`text-sm ${tiffany.muted}`}>
            {error || "Project not found"}
          </p>
          <Link
            to="/projects"
            className={`inline-flex items-center gap-1.5 text-sm ${tiffany.accentText} hover:underline transition-colors`}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Main layout
  // -------------------------------------------------------------------

  return (
    <div className={`w-screen h-screen ${tiffany.bg} flex flex-col overflow-hidden`}>
      {/* ================================================================= */}
      {/* Top bar */}
      {/* ================================================================= */}
      <header
        className={`shrink-0 h-11 ${tiffany.panelBg} ${tiffany.panelBorder} border-b flex items-center justify-between px-3`}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/projects"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${tiffany.muted} ${tiffany.hover} transition-colors`}
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Projects
          </Link>
          <div className="w-px h-4 bg-[#c8ece8]" />
          <span className={`text-xs font-semibold ${tiffany.heading}`}>
            {project.title}
          </span>
          {project.folderPath && (
            <>
              <div className="w-px h-4 bg-[#c8ece8]" />
              <span className={`text-xs ${tiffany.subtle} font-mono`}>
                {project.folderPath}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs ${tiffany.subtle}`}>Editor</span>
        </div>
      </header>

      {/* ================================================================= */}
      {/* Body: left + main + right sidebar */}
      {/* ================================================================= */}
      <div className="flex-1 flex overflow-hidden" style={{ height: `calc(100vh - 2.75rem - ${bottomHeight}px)` }}>
        {/* Left toolbar strip */}
        <aside
          className={`shrink-0 w-12 ${tiffany.panelBg} ${tiffany.panelBorder} border-r flex flex-col items-center py-2 gap-1`}
        >
          <button
            className={`w-8 h-8 rounded flex items-center justify-center ${tiffany.muted} ${tiffany.hover} transition-colors`}
            title="Add"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
          <button
            className={`w-8 h-8 rounded flex items-center justify-center ${tiffany.muted} ${tiffany.hover} transition-colors`}
            title="Delete"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </aside>

        {/* Main workspace */}
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-2">
            <div className={`w-16 h-16 mx-auto rounded-2xl ${tiffany.panelBg} ${tiffany.panelBorder} border flex items-center justify-center`}>
              <FolderOpenIcon className={`w-7 h-7 ${tiffany.subtle}`} />
            </div>
            <p className={`text-sm ${tiffany.muted}`}>Project workspace</p>
            <p className={`text-xs ${tiffany.subtle}`}>
              Select files from the left to begin
            </p>
          </div>
        </main>

        {/* Right properties panel */}
        <div
          className="shrink-0 flex"
          style={{ width: rightWidth }}
        >
          {/* Resize handle */}
          <div
            className={`w-1 cursor-col-resize ${tiffany.panelBorder} border-l hover:bg-[#81d8d0]/30 transition-colors`}
            onMouseDown={() => startResize("right")}
          />

          <aside
            className={`flex-1 ${tiffany.panelBg} ${tiffany.panelBorder} border-l overflow-y-auto`}
          >
            <div className="p-3 space-y-4">
              {/* Project info */}
              <div className="space-y-2">
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${tiffany.accentText}`}>
                  Project
                </h3>
                <div className="space-y-1.5">
                  <div>
                    <label className={`text-xs ${tiffany.subtle}`}>Title</label>
                    <p className={`text-sm ${tiffany.text}`}>{project.title}</p>
                  </div>
                  <div>
                    <label className={`text-xs ${tiffany.subtle}`}>Folder</label>
                    <p className={`text-xs ${tiffany.muted} font-mono truncate`}>
                      {project.folderPath || "—"}
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs ${tiffany.subtle}`}>Created</label>
                    <p className={`text-xs ${tiffany.muted}`}>
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className={`border-t ${tiffany.panelBorder}`} />

              {/* Properties placeholder */}
              <div className="space-y-2">
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${tiffany.accentText}`}>
                  Properties
                </h3>
                <p className={`text-xs ${tiffany.subtle}`}>
                  No item selected
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Bottom panel */}
      {/* ================================================================= */}
      <div className="shrink-0 flex flex-col" style={{ height: bottomHeight }}>
        {/* Resize handle */}
        <div
          className={`h-1 cursor-row-resize ${tiffany.panelBorder} border-t hover:bg-[#81d8d0]/30 transition-colors`}
          onMouseDown={() => startResize("bottom")}
        />

        <div
          className={`flex-1 ${tiffany.panelBg} ${tiffany.panelBorder} border-t overflow-y-auto`}
        >
          <div className="flex items-center h-full justify-center">
            <p className={`text-xs ${tiffany.subtle}`}>Output / Console</p>
          </div>
        </div>
      </div>
    </div>
  );
}
