import { Application } from "express";
import fs from "node:fs";
import { homedir } from "node:os";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  title: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// JSON Database helpers
// ---------------------------------------------------------------------------

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(homedir(), "effectnode-cli", "data", "projects.json"); //path.resolve(__dirname, "..", "data", "projects.json");

function ensureDb(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2), "utf-8");
  }
}

function readProjects(): Project[] {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw) as Project[];
}

function writeProjects(projects: Project[]): void {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(projects, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateFolderPath(input: string): string {
  const resolved = path.resolve(input.trim());

  // Prevent writing system paths or other dangerous locations
  if (resolved === "/" || resolved === path.resolve("/")) {
    throw new Error("Root directory is not allowed");
  }

  // Verify the path exists and is a directory
  if (!fs.existsSync(resolved)) {
    throw new Error("Selected folder does not exist");
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error("Selected path is not a directory");
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function setupProjects({ app }: { app: Application }) {
  // -----------------------------------------------------------------------
  // List all projects
  // -----------------------------------------------------------------------
  app.get("/api/projects", (_req, res) => {
    const projects = readProjects();
    res.json(projects);
  });

  // -----------------------------------------------------------------------
  // Get single project
  // -----------------------------------------------------------------------
  app.get("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  // -----------------------------------------------------------------------
  // Create project
  // -----------------------------------------------------------------------
  app.post("/api/projects", (req, res) => {
    const { title, folderPath } = req.body as {
      title?: string;
      folderPath?: string;
    };

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "Project title is required" });
      return;
    }

    let resolved = "";
    if (folderPath && folderPath.trim()) {
      try {
        resolved = validateFolderPath(folderPath);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
        return;
      }
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim(),
      folderPath: resolved,
      createdAt: now,
      updatedAt: now,
    };

    const projects = readProjects();
    projects.push(project);
    writeProjects(projects);

    res.status(201).json(project);
  });

  // -----------------------------------------------------------------------
  // Update project
  // -----------------------------------------------------------------------
  app.put("/api/projects/:id", (req, res) => {
    const { title, folderPath } = req.body as {
      title?: string;
      folderPath?: string;
    };

    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        res.status(400).json({ error: "Project title cannot be empty" });
        return;
      }
      projects[index].title = title.trim();
    }

    if (folderPath !== undefined) {
      const trimmed = folderPath.trim();
      if (trimmed) {
        try {
          projects[index].folderPath = validateFolderPath(folderPath);
        } catch (err: any) {
          res.status(400).json({ error: err.message });
          return;
        }
      } else {
        projects[index].folderPath = "";
      }
    }

    projects[index].updatedAt = new Date().toISOString();
    writeProjects(projects);

    res.json(projects[index]);
  });

  // -----------------------------------------------------------------------
  // Delete project
  // -----------------------------------------------------------------------
  app.delete("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    projects.splice(index, 1);
    writeProjects(projects);

    res.json({ success: true });
  });

  // -----------------------------------------------------------------------
  // Open native folder selection dialog
  // -----------------------------------------------------------------------
  app.post("/api/projects/select-folder", async (_req, res) => {
    try {
      // Dynamic import because node-file-dialog is CommonJS
      // @ts-ignore
      const dialog = (await import("node-file-dialog")).default;
      const dirs: string[] = await dialog({ type: "directory" });
      res.json({ folderPath: dirs[0] ?? null });
    } catch (err: any) {
      if (
        err?.message &&
        (err.message.includes("Nothing selected") ||
          err.message.includes("Error: Nothing selected"))
      ) {
        res.json({ folderPath: null });
        return;
      }
      console.error("Folder selection failed:", err);
      res.status(500).json({ error: "Failed to open dialog" });
    }
  });
}
