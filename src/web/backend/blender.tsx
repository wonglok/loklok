import { Application } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { randomBytes } from "crypto";
import JSZip from "jszip";
// @ts-ignore
import licenseContent from "../public/b3/LICENSE.md";
// @ts-ignore
import pythonContent from "../public/b3/__init__.py";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// JSON file-based project database
// ---------------------------------------------------------------------------

interface ProjectEntry {
  _id: string;
  name: string;
  projectID: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsDB {
  projects: ProjectEntry[];
}

const DB_PATH = join(homedir(), "./loklok-studio/database/projects.json");

mkdirSync(dirname(DB_PATH), { recursive: true });

function readDB(): ProjectsDB {
  try {
    if (!existsSync(DB_PATH)) return { projects: [] };
    return JSON.parse(readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { projects: [] };
  }
}

function writeDB(db: ProjectsDB): void {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function genId(): string {
  return randomBytes(12).toString("hex"); // 24-char hex, MongoDB-like
}

function genProjectID(): string {
  return randomBytes(4).toString("hex"); // 8-char short ID for URLs
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function setupBlender({ app }: { app: Application }) {
  // -----------------------------------------------------------------------
  // Blender plugin zip
  // -----------------------------------------------------------------------
  app.get("/api/blender/plugin.zip", async (_req, res) => {
    try {
      const zip = new JSZip();
      zip.file("plugin/__init__.py", pythonContent);
      zip.file("plugin/LICENSE", licenseContent);

      const zipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="b3-plugin.zip"',
      );
      res.send(Buffer.from(zipBuffer));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create zip" });
    }
  });

  // -----------------------------------------------------------------------
  // Projects — JSON file-backed CRUD
  // -----------------------------------------------------------------------

  // GET /api/projects — list all projects
  app.get("/api/projects", (_req, res) => {
    try {
      const db = readDB();
      // Sort newest first
      db.projects.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      res.json(db.projects);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err?.message || "Failed to list projects" });
    }
  });

  // POST /api/projects — create a new project
  app.post("/api/projects", (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "Project name is required" });
        return;
      }

      const now = new Date().toISOString();
      const entry: ProjectEntry = {
        _id: genId(),
        name: name.trim(),
        projectID: genProjectID(),
        createdAt: now,
        updatedAt: now,
      };

      const db = readDB();
      db.projects.push(entry);
      writeDB(db);

      res.status(201).json(entry);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err?.message || "Failed to create project" });
    }
  });

  // DELETE /api/projects/:id — delete a project by _id
  app.delete("/api/projects/:id", (req, res) => {
    try {
      const { id } = req.params;
      const db = readDB();
      const index = db.projects.findIndex((p) => p._id === id);

      if (index === -1) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      db.projects.splice(index, 1);
      writeDB(db);

      res.json({ ok: true });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err?.message || "Failed to delete project" });
    }
  });
}
