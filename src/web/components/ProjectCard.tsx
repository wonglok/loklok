import { useState } from "react";
import type { Project } from "../client/stores/useProjectStore";
import { useProjectStore } from "../client/stores/useProjectStore";
import { ProjectForm } from "./ProjectForm";
import {
  FolderIcon,
  EditIcon,
  TrashIcon,
  FolderOpenIcon,
} from "./Icons";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [editing, setEditing] = useState(false);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  if (editing) {
    return (
      <ProjectForm
        project={project}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3 hover:border-zinc-300 transition-colors shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-black truncate">
          {project.title}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-2 rounded-lg text-zinc-600 hover:text-black hover:bg-zinc-100 transition-colors"
            title="Edit project"
          >
            <EditIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => deleteProject(project.id)}
            className="p-2 rounded-lg text-zinc-700 hover:text-red-600 hover:bg-red-100 transition-colors"
            title="Delete project"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-zinc-600">
        {project.folderPath ? (
          <>
            <FolderOpenIcon className="w-4 h-4 text-zinc-500 shrink-0" />
            <span className="truncate font-mono text-xs">{project.folderPath}</span>
          </>
        ) : (
          <>
            <FolderIcon className="w-4 h-4 shrink-0" />
            <span className="italic">No folder selected</span>
          </>
        )}
      </div>

      <div className="text-xs text-zinc-500">
        Created {new Date(project.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
