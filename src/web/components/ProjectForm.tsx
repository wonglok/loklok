import { useState, type FormEvent } from "react";
import type { Project } from "../client/stores/useProjectStore";
import { useProjectStore } from "../client/stores/useProjectStore";
import { PlusIcon, CheckIcon, XIcon, FolderIcon } from "./Icons";

interface ProjectFormProps {
  project?: Project; // if provided, we're editing
  onCancel: () => void;
  onSaved: () => void;
}

export function ProjectForm({ project, onCancel, onSaved }: ProjectFormProps) {
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const selectFolder = useProjectStore((s) => s.selectFolder);
  const loading = useProjectStore((s) => s.loading);

  const [title, setTitle] = useState(project?.title ?? "");
  const [folderPath, setFolderPath] = useState(project?.folderPath ?? "");
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!project;

  async function handleSelectFolder() {
    const path = await selectFolder();
    if (path) {
      setFolderPath(path);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Project title is required");
      return;
    }

    if (isEditing) {
      const result = await updateProject(project!.id, {
        title: title.trim(),
        folderPath,
      });
      if (result) onSaved();
    } else {
      const result = await createProject(title.trim(), folderPath);
      if (result) {
        setTitle("");
        setFolderPath("");
        onSaved();
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-studio-850 border border-studio-700 rounded-lg p-5 space-y-4"
    >
      <div className="space-y-2">
        <label
          htmlFor="project-title"
          className="block text-sm font-medium text-ice-200"
        >
          Project Title
        </label>
        <input
          id="project-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Project"
          className="w-full px-3 py-2 bg-studio-800 border border-studio-700 rounded-md text-ice-50 placeholder-ice-600 text-sm focus:outline-none focus:border-tiffany-500 focus:ring-1 focus:ring-tiffany-500/30 transition-colors"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-ice-200">
          Project Folder
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectFolder}
            className="inline-flex items-center gap-2 px-3 py-2 bg-studio-800 hover:bg-studio-700 text-ice-200 rounded-md text-sm transition-colors shrink-0 border border-studio-700"
          >
            <FolderIcon className="w-4 h-4" />
            {folderPath ? "Change Folder" : "Select Folder"}
          </button>
          {folderPath && (
            <span className="text-sm text-ice-400 font-mono truncate">
              {folderPath}
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-tiffany-400 hover:bg-tiffany-300 text-studio-900 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {isEditing ? (
            <CheckIcon className="w-4 h-4" />
          ) : (
            <PlusIcon className="w-4 h-4" />
          )}
          {isEditing ? "Save Changes" : "Create Project"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 px-4 py-2 bg-studio-800 hover:bg-studio-700 text-ice-400 rounded-md text-sm transition-colors border border-studio-700"
        >
          <XIcon className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </form>
  );
}
