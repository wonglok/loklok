import { create } from "zustand";

export interface Project {
  id: string;
  title: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectStore {
  projects: Project[];
  loading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  createProject: (title: string, folderPath: string) => Promise<Project | null>;
  updateProject: (
    id: string,
    data: { title?: string; folderPath?: string },
  ) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  selectFolder: () => Promise<string | null>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const projects: Project[] = await res.json();
      set({ projects, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createProject: async (title, folderPath) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, folderPath }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create project");
      }
      const project: Project = await res.json();
      set((s) => ({
        projects: [...s.projects, project],
        loading: false,
      }));
      return project;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  updateProject: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update project");
      }
      const updated: Project = await res.json();
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? updated : p)),
        loading: false,
      }));
      return updated;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  deleteProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        loading: false,
      }));
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  selectFolder: async () => {
    try {
      const res = await fetch("/api/projects/select-folder", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to open folder dialog");
      const { folderPath }: { folderPath: string | null } = await res.json();
      return folderPath;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },
}));
