import { Application } from "express";
import JSZip from "jszip";
// @ts-ignore
import licenseContent from "../public/b3/LICENSE.md";
// @ts-ignore
import pythonContent from "../public/b3/__init__.py";

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
}
