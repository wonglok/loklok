// ---------------------------------------------------------------------------
// OPFS (Origin Private File System) utilities
// ---------------------------------------------------------------------------
// Low-level helpers for reading, writing, and managing files in the
// browser's private origin-scoped filesystem via the File System Access API.
// ---------------------------------------------------------------------------

/** Check whether OPFS is available in the current browsing context. */
export function isOPFSAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

/** Wrapper around `navigator.storage.estimate()` for the workspace store. */
export async function getOPFSUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!isOPFSAvailable()) return null;
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.usage == null || estimate.quota == null) return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/** Get (or create) a nested directory handle relative to a parent. */
export async function getDir(
  parent: FileSystemDirectoryHandle,
  name: string,
  create = false,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name, { create });
  } catch {
    return null;
  }
}

/** Get the per-project root directory: `project/{projectID}/` */
export async function getProjectRoot(
  projectID: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!isOPFSAvailable()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const projectDir = await root.getDirectoryHandle("project", { create: true });
    return await projectDir.getDirectoryHandle(projectID, { create: true });
  } catch {
    return null;
  }
}

/** List subdirectory names inside a directory handle. */
export async function listDirs(
  parent: FileSystemDirectoryHandle,
): Promise<string[]> {
  const names: string[] = [];
  try {
    // @ts-expect-error – values() may not be typed in all TS lib versions
    for await (const [name, handle] of parent.entries()) {
      if (handle.kind === "directory") names.push(name);
    }
  } catch {
    // Ignore
  }
  return names;
}

/** A single entry (file or directory) returned by listEntries. */
export interface FSEntry {
  name: string;
  kind: "file" | "directory";
  size: number; // bytes, 0 for directories
}

/** List all entries (files + directories) inside a directory handle with sizes. */
export async function listEntries(
  parent: FileSystemDirectoryHandle,
): Promise<FSEntry[]> {
  const entries: FSEntry[] = [];
  try {
    // @ts-expect-error – entries() iterator typing
    for await (const [name, handle] of parent.entries()) {
      if (handle.kind === "directory") {
        entries.push({ name, kind: "directory", size: 0 });
      } else {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        entries.push({ name, kind: "file", size: file.size });
      }
    }
  } catch {
    // Ignore
  }
  // Sort: directories first, then files, both alphabetically
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/** Recursively remove a directory and all its contents. */
export async function removeDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await parent.removeEntry(name, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Check whether an entry exists inside a directory handle. */
export async function exists(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch {
    try {
      await parent.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// File read / write
// ---------------------------------------------------------------------------

/** Write a string as a UTF-8 file inside a directory handle. */
export async function writeTextFile(
  parent: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const handle = await parent.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Write binary data as a file inside a directory handle. */
export async function writeBinaryFile(
  parent: FileSystemDirectoryHandle,
  name: string,
  data: ArrayBuffer,
): Promise<void> {
  const handle = await parent.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

/** Read a file as an ArrayBuffer. */
export async function readBinaryFile(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<ArrayBuffer | null> {
  try {
    const handle = await parent.getFileHandle(name);
    const file = await handle.getFile();
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

/** Read a text file as a string. */
export async function readTextFile(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    const handle = await parent.getFileHandle(name);
    const file = await handle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** Serialize ArrayBuffer data for JSON-safe transmission. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
