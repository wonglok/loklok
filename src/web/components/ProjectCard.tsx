import { useState } from "react";
import { Link } from "react-router-dom";
import type { Project } from "../client/stores/useProjectStore";
import { useProjectStore } from "../client/stores/useProjectStore";
import { ProjectForm } from "./ProjectForm";
import { ConfirmModal } from "./ConfirmModal";
import {
  FolderIcon,
  EditIcon,
  TrashIcon,
  FolderOpenIcon,
  ArrowRightIcon,
} from "./Icons";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  const handleDelete = () => {
    deleteProject(project.id);
    setShowDeleteConfirm(false);
  };

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
    <div className="bg-white border border-[#c8ece8] rounded-xl p-5 space-y-3 hover:border-[#81d8d0] transition-colors shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-[#1a4a45] truncate">
          {project.title}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-2 rounded-lg text-[#6b9e97] hover:text-[#2fa89c] hover:bg-[#e8f8f5] transition-colors"
            title="Edit project"
          >
            <EditIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 rounded-lg text-[#6b9e97] hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete project"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-[#6b9e97]">
        {project.folderPath ? (
          <>
            <FolderOpenIcon className="w-4 h-4 text-[#a3c9c3] shrink-0" />
            <span className="truncate font-mono text-xs">{project.folderPath}</span>
          </>
        ) : (
          <>
            <FolderIcon className="w-4 h-4 shrink-0" />
            <span className="italic">No folder selected</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-[#a3c9c3]">
          Created {new Date(project.createdAt).toLocaleDateString()}
        </div>
        <Link
          to={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#81d8d0] hover:bg-[#6ac4bc] text-white rounded-lg text-xs font-medium transition-colors"
        >
          Open
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </Link>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Project"
        message={`Are you sure you want to delete "${project.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
