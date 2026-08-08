"use client";

import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectEntry {
  _id: string;
  name: string;
  projectID: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
//

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setProjects(data);
    } catch {
      setError("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed");
      }
      const project = await res.json();
      setName("");
      setProjects((prev) => [project, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setProjects((prev) => prev.filter((p) => p._id !== id));
      setConfirmDelete(null);
    } catch {
      setError("Failed to delete project");
      setConfirmDelete(null);
    }
  };

  // Keyboard shortcuts for confirm modal
  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDelete(null);
      if (e.key === "Enter") handleDelete(confirmDelete);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-surface-primary text-text-primary font-mono text-xs">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-4">
        {/*  */}
        <Link
          to="/"
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors"
        >
          <HomeIcon />
        </Link>
        <h1 className="text-sm font-semibold tracking-wide text-text-primary flex-1">
          Projects
        </h1>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        {/* Create form */}
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name…"
            className="
              flex-1 px-3 py-2 rounded-lg
              bg-surface-secondary border border-border
              text-text-primary placeholder:text-text-muted
              text-xs font-mono
              focus:outline-none focus:border-accent/40
              transition-colors
            "
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="
              flex items-center gap-1.5 px-4 py-2 rounded-lg
              bg-surface-tertiary border border-border
              text-text-secondary hover:text-text-primary hover:bg-surface-tertiary/80
              text-xs font-mono
              transition-all duration-150
              disabled:opacity-30 disabled:cursor-not-allowed
            "
          >
            {creating ? <SpinnerIcon /> : <PlusIcon />}
            <span>Create</span>
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="px-3 py-2 rounded-lg border border-status-red/20 bg-status-red/5 text-status-red/80">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-status-red/50 hover:text-status-red"
            >
              ×
            </button>
          </div>
        )}

        {/* Project list */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-text-muted mb-3">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <SpinnerIcon />
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted/40">
              <FolderIcon />
              <span>No projects yet</span>
            </div>
          )}

          {projects.map((p) => (
            <div
              key={p._id}
              className="
                flex items-center gap-3 px-3 py-2.5 rounded-lg
                bg-surface-secondary border border-border
                hover:bg-surface-tertiary
                transition-colors group
              "
            >
              <FolderIcon />
              <div className="flex-1 min-w-0">
                <div className="text-text-secondary truncate">{p.name}</div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {p.projectID} · {fmtDate(p.updatedAt)}
                </div>
              </div>

              <button
                onClick={() => setConfirmDelete(p._id)}
                className="
                  p-1.5 rounded text-text-muted/30
                  hover:text-status-red/80 hover:bg-status-red/10
                  opacity-0 group-hover:opacity-100
                  transition-all duration-100
                "
                title="Delete project"
              >
                <TrashIcon />
              </button>

              <Link
                to={`/viewer/${p.projectID}`}
                className="
                  flex items-center gap-1 px-2 py-1.5 rounded-lg
                  text-text-muted hover:text-accent
                  border border-transparent hover:bg-accent-subtle
                  transition-all duration-150
                "
                title="View deployed scene"
              >
                <EyeIcon />
              </Link>

              <Link
                to={`/projects/${p.projectID}`}
                className="
                  flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                  text-text-muted hover:text-text-primary
                  bg-surface-tertiary hover:bg-surface-tertiary/80
                  border border-border hover:border-text-muted
                  transition-all duration-150
                "
              >
                <span className="text-[10px]">Edit</span>
                <ArrowRightIcon />
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-primary/70 backdrop-blur-sm">
          <div
            className="
              w-[340px] px-6 py-6 rounded-xl
              bg-surface-primary border border-border
              shadow-lg text-text-primary font-mono text-xs
              flex flex-col gap-4
            "
          >
            <div>
              <div className="text-sm font-semibold">Delete project?</div>
              <div className="text-text-muted mt-1">
                This action cannot be undone. All project files and deployments
                will be permanently removed.
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="
                  px-4 py-2 rounded-lg text-text-muted
                  border border-border bg-surface-secondary
                  hover:text-text-primary hover:bg-surface-tertiary
                  transition-all duration-150
                "
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="
                  px-4 py-2 rounded-lg text-white
                  bg-status-red border border-status-red
                  hover:bg-status-red/90
                  transition-all duration-150
                "
              >
                Delete
              </button>
            </div>
            <div className="text-[10px] text-text-muted/50 text-center">
              <kbd className="px-1 py-0.5 rounded border border-border bg-surface-secondary">
                Esc
              </kbd>{" "}
              to cancel ·{" "}
              <kbd className="px-1 py-0.5 rounded border border-border bg-surface-secondary">
                Enter
              </kbd>{" "}
              to confirm
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
