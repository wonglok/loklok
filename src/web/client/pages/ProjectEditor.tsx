import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project } from "../stores/useProjectStore";
import { ArrowLeftIcon, FolderOpenIcon } from "../../components/Icons";

export function ProjectEditor() {
  const { projectID } = useParams<{ projectID: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center">
        <p className="text-zinc-400 text-sm">Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-zinc-500 text-sm">
            {error || "Project not found"}
          </p>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-black transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        {/* Back */}
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-black transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Projects
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {project.title}
          </h1>
          {project.folderPath && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-zinc-500">
              <FolderOpenIcon className="w-4 h-4 shrink-0" />
              <span className="font-mono text-xs">{project.folderPath}</span>
            </div>
          )}
        </div>

        {/* Editor area placeholder */}
        <div className="border border-zinc-200 rounded-xl p-8 text-center">
          <p className="text-zinc-400 text-sm">Editor coming soon</p>
        </div>
      </div>
    </div>
  );
}
