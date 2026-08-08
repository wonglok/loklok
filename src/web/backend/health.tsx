import { Application } from "express";

export async function setupHealth({ app }: { app: Application }) {
  // Health endpoint for AI agents to verify the server is alive
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  //
}
