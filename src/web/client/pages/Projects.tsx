import { useEffect, useState } from "react";
import { useProjectStore } from "../stores/useProjectStore";
import { ProjectCard } from "../../components/ProjectCard";
import { ProjectForm } from "../../components/ProjectForm";
import { StudioBackdrop } from "../../components/StudioBackdrop";
import { PlusIcon } from "../../components/Icons";

export function Projects() {
  const { projects, loading, error, fetchProjects } = useProjectStore();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const count = projects.length;

  return (
    <div className="relative min-h-screen bg-studio-900 text-ice-50">
      <StudioBackdrop />
      <div className="relative max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-tiffany-400">
              Workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Projects
            </h1>
            <p className="text-sm text-ice-400 mt-1">
              {count > 0
                ? `${count} ${count === 1 ? "project" : "projects"}`
                : "Manage your project folders"}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-tiffany-400 hover:bg-tiffany-300 text-studio-900 text-sm font-semibold transition-colors shrink-0"
          >
            <PlusIcon className="w-4 h-4" />
            New Project
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <ProjectForm
            onCancel={() => setShowForm(false)}
            onSaved={() => setShowForm(false)}
          />
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && projects.length === 0 && (
          <div className="text-center py-12 text-ice-600 text-sm">
            Loading projects…
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && !showForm && (
          <div className="text-center py-16 space-y-4 rounded-lg border border-dashed border-studio-600">
            <p className="text-ice-200 text-sm">No projects yet</p>
            <p className="text-ice-600 text-xs">
              Create your first project to start syncing assets from Blender.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-tiffany-400 hover:bg-tiffany-300 text-studio-900 text-sm font-semibold transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Create a project
            </button>
          </div>
        )}

        {/* Project list */}
        {projects.length > 0 && (
          <div className="space-y-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
