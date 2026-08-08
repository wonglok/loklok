// ---------------------------------------------------------------------------
// Deploy SDK — browser-side ZIP creation from OPFS + upload to server
// ---------------------------------------------------------------------------

import JSZip from "jszip";
import {
  getProjectRoot,
  getDir,
  readBinaryFile,
  readTextFile,
  writeBinaryFile,
  listEntries,
  removeDir,
} from "../utils/workspaceStorage";

export interface DeployResult {
  deployID: string;
  url: string;
  size: number;
  objectCount: number;
}

/**
 * Recursively add all files from a directory handle into a JSZip instance.
 */
async function addDirToZip(
  zip: JSZip,
  handle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<void> {
  const entries = await listEntries(handle);
  for (const entry of entries) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      const subDir = await getDir(handle, entry.name);
      if (subDir) {
        await addDirToZip(zip, subDir, entryPath);
      }
    } else {
      const data = await readBinaryFile(handle, entry.name);
      if (data) {
        zip.file(entryPath, data);
      }
    }
  }
}

/**
 * Create a ZIP from the OPFS latest-version directory and return as a Blob.
 */
async function zipLatestVersion(projectID: string): Promise<Blob | null> {
  const root = await getProjectRoot(projectID);
  if (!root) return null;

  const latestDir = await getDir(root, "latest-version");
  if (!latestDir) return null;

  const zip = new JSZip();
  await addDirToZip(zip, latestDir);
  return zip.generateAsync({ type: "blob" });
}

/**
 * Save ZIP to OPFS deploy folder for local reference.
 */
async function saveZipToOPFS(
  projectID: string,
  deployID: string,
  blob: Blob,
): Promise<void> {
  const root = await getProjectRoot(projectID);
  if (!root) return;

  // Create deploy directory structure
  const deployDir = await root.getDirectoryHandle("deploy", { create: true });
  const projectsDir = await deployDir.getDirectoryHandle("projects", {
    create: true,
  });
  const projDir = await projectsDir.getDirectoryHandle(projectID, {
    create: true,
  });
  const deploymentsDir = await projDir.getDirectoryHandle("deployments", {
    create: true,
  });
  const verDir = await deploymentsDir.getDirectoryHandle(deployID, {
    create: true,
  });

  const buf = await blob.arrayBuffer();
  await writeBinaryFile(verDir, "data.zip", buf);
}

/**
 * Full deploy flow:
 * 1. Read OPFS latest-version/
 * 2. Create ZIP in memory
 * 3. Save ZIP to OPFS deploy folder
 * 4. Upload to server API which stores in S3 + MongoDB
 */
export async function deployProject(
  projectID: string,
  onProgress?: (msg: string) => void,
): Promise<DeployResult | null> {
  // 1+2. Zip the latest version
  onProgress?.("Zipping scene data…");
  const zipBlob = await zipLatestVersion(projectID);
  if (!zipBlob) throw new Error("No saved scene to deploy. Save the scene first.");

  // 3. Remove old deploy folder from OPFS
  onProgress?.("Cleaning old deployments…");
  const root = await getProjectRoot(projectID);
  if (root) {
    await removeDir(root, "deploy");
  }

  // 4. Save new ZIP to OPFS deploy folder
  onProgress?.("Saving to local storage…");
  const deployID = `deploy-${Date.now().toString(36)}-local`;
  await saveZipToOPFS(projectID, deployID, zipBlob);

  // 5. Upload to server (server will delete old S3 + MongoDB deployments)
  onProgress?.("Uploading to server…");
  const formData = new FormData();
  formData.append("file", zipBlob, "data.zip");

  const res = await fetch(`/api/projects/${projectID}/deploy`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error ?? "Upload failed");
  }

  const result: DeployResult = await res.json();
  return result;
}
