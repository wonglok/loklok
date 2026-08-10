import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProjectStore } from "../stores/useProjectStore";
import { ProjectCard } from "../../components/ProjectCard";
import { ProjectForm } from "../../components/ProjectForm";
import { PlusIcon, ArrowLeftIcon } from "../../components/Icons";

export function Projects() {
  const { projects, loading, error, fetchProjects } = useProjectStore();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="min-h-screen bg-[#f5fdfc] text-[#2d5a55]">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Back */}
        {/* <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#6b9e97] hover:text-[#2fa89c] transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Home
        </Link> */}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1a4a45]">
              Projects
            </h1>
            <p className="text-[#6b9e97] text-sm mt-1">
              Manage your project folders
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#81d8d0] hover:bg-[#6ac4bc] text-white rounded-lg text-sm font-medium transition-colors"
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
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && projects.length === 0 && (
          <div className="text-center py-12 text-[#a3c9c3] text-sm">
            Loading projects...
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && !showForm && (
          <div className="text-center py-16 space-y-3">
            <p className="text-[#6b9e97] text-sm">No projects yet</p>
            <p className="text-[#a3c9c3] text-xs">
              Create your first project to get started
            </p>
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
