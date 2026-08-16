import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Project } from "../../../stores/useProjectStore";
import { useProjectStore } from "../../../stores/useProjectStore";
import { ConfirmModal } from "../../../../components/ConfirmModal";
import { TrashIcon } from "../../../../components/Icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SettingsPage() {
  const { projectID } = useParams<{ projectID: string }>();
  const navigate = useNavigate();
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const [project, setProject] = useState<Project | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectID}`);
        if (!res.ok) throw new Error("Project not found");
        const data: Project = await res.json();
        if (!cancelled) setProject(data);
      } catch {
        // The shell surfaces load errors.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectID]);

  const handleDelete = async () => {
    const ok = await deleteProject(projectID!);
    if (ok) navigate("/projects");
  };

  if (!project) return null;

  const rows: Array<[string, string]> = [
    ["Title", project.title],
    ["Folder", project.folderPath || "—"],
    ["Created", formatDate(project.createdAt)],
    ["Updated", formatDate(project.updatedAt)],
    ["ID", project.id],
  ];

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-tiffany-400" />
          <h1 className="text-xl font-semibold text-ice-50 tracking-tight">
            Settings
          </h1>
        </div>
        <p className="text-sm text-ice-400 mt-1.5 pl-3.5">
          Project configuration
        </p>
      </header>

      {/* Properties */}
      <div className="rounded-lg border border-studio-700 bg-studio-850 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ice-600">
          Project properties
        </h3>
        <dl className="mt-4 space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-xs text-ice-600 shrink-0">{label}</dt>
              <dd className="text-[13px] text-ice-200 font-mono truncate">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-studio-700 bg-studio-850 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ice-600">
          Danger zone
        </h3>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-ice-200">Delete this project</p>
            <p className="text-xs text-ice-600 mt-0.5">
              Removes the project from the workspace. Files on disk are left
              untouched.
            </p>
          </div>
          <button
            onClick={() => setConfirm(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-sm font-medium transition-colors shrink-0"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirm}
        title="Delete project"
        message={`Delete "${project.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
