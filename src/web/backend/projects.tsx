import { Application } from "express";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { homedir } from "node:os";
import path, { join } from "node:path";

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

const DB_PATH = join(homedir(), "effectnode-cli", "data", "projects.json");

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

    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim(),
      folderPath: folderPath?.trim() ?? "",
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
      projects[index].folderPath = folderPath.trim();
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
  // -----------------------------------------------------------------------
  // Open native folder selection dialog
  // -----------------------------------------------------------------------
  app.post("/api/projects/select-folder", async (_req, res) => {
    const script = `POSIX path of (choose folder with prompt "Select a project folder:")`;

    // macOS: use osascript via execFile
    if (process.platform === "darwin") {
      execFile("osascript", ["-e", script], (err, stdout) => {
        if (err) {
          // User cancelled the dialog (exit code 1)
          if (err.code === 1) {
            res.json({ folderPath: null });
            return;
          }
          console.error("Folder selection failed:", err);
          res.status(500).json({ error: "Failed to open dialog" });
          return;
        }
        const folderPath = stdout.trim();
        // Remove trailing slash from osascript output
        const cleaned =
          folderPath.endsWith("/") ? folderPath.slice(0, -1) : folderPath;
        res.json({ folderPath: cleaned || null });
      });
      return;
    }

    // Linux / Windows: fallback to node-file-dialog
    try {
      // @ts-ignore
      const dialog = (await import("node-file-dialog")).default;
      const dirs: string[] = await dialog({ type: "directory" });
      res.json({ folderPath: dirs[0] ?? null });
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("Nothing selected")) {
        res.json({ folderPath: null });
        return;
      }
      console.error("Folder selection failed:", err);
      res.status(500).json({ error: "Failed to open dialog" });
    }
  });
}
