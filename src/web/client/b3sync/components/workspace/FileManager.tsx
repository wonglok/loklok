"use client";

import { useEffect, useState, useCallback } from "react";
import { useProjectStore } from "../stores/projectStore";
import {
  getProjectRoot,
  getDir,
  listEntries,
  removeDir,
} from "../utils/workspaceStorage";

// ---------------------------------------------------------------------------
// File manager — OPFS directory browser overlay
// ---------------------------------------------------------------------------

function humanSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {open ? (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1" />
      ) : (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      )}
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  kind: "file" | "directory";
  size: number;
  children?: TreeNode[];
}

async function buildTree(
  handle: FileSystemDirectoryHandle,
): Promise<TreeNode[]> {
  const entries = await listEntries(handle);
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.kind === "directory") {
      const subDir = await getDir(handle, entry.name);
      const children = subDir ? await buildTree(subDir) : [];
      nodes.push({ ...entry, children });
    } else {
      nodes.push(entry);
    }
  }

  return nodes;
}

function countFiles(nodes: TreeNode[]): { files: number; dirs: number } {
  let files = 0;
  let dirs = 0;
  for (const n of nodes) {
    if (n.kind === "directory") {
      dirs++;
      const sub = countFiles(n.children ?? []);
      files += sub.files;
      dirs += sub.dirs;
    } else {
      files++;
    }
  }
  return { files, dirs };
}

// ---------------------------------------------------------------------------
// Tree row
// ---------------------------------------------------------------------------

function TreeRow({
  node,
  depth,
  path,
  expanded,
  onToggle,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  path: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const isDir = node.kind === "directory";
  const padLeft = depth * 16;
  const isExpanded = expanded.has(path);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <div
        className="
          flex items-center gap-1.5 w-full text-left py-1
          text-[10px] font-mono text-text-secondary
          hover:bg-surface-secondary rounded transition-colors duration-100
          group
        "
        style={{ paddingLeft: 12 + padLeft }}
      >
        <button
          onClick={() => isDir && onToggle(path)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <span className="shrink-0">
            {isDir ? (
              <ChevronIcon open={isExpanded} />
            ) : (
              <span className="inline-block w-[10px]" />
            )}
          </span>
          <span className="shrink-0 text-text-muted">
            {isDir ? <FolderIcon open={isExpanded} /> : <FileIcon />}
          </span>
          <span className="truncate flex-1">{node.name}</span>
          <span className="shrink-0 text-text-muted/70 tabular-nums">
            {humanSize(node.size)}
          </span>
        </button>

        {/* Delete button — directories only */}
        {isDir && (
          <span className="shrink-0 pr-2">
            {confirm ? (
              <span className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(path);
                    setConfirm(false);
                  }}
                  className="
                    px-1.5 py-0.5 rounded text-[9px]
                    text-status-red/80 bg-status-red/15
                    hover:bg-status-red/25
                    transition-colors duration-100
                  "
                >
                  Del
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm(false);
                  }}
                  className="
                    px-1 py-0.5 rounded text-[9px]
                    text-text-muted hover:text-text-primary hover:bg-surface-secondary
                    transition-colors duration-100
                  "
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirm(true);
                }}
                className="
                  opacity-0 group-hover:opacity-100
                  p-0.5 rounded text-text-muted/40
                  hover:text-status-red/80 hover:bg-status-red/10
                  transition-all duration-100
                "
                title="Delete folder"
              >
                <TrashIcon />
              </button>
            )}
          </span>
        )}
      </div>

      {isDir && isExpanded && node.children && (
        <>
          {node.children.map((child) => (
            <TreeRow
              key={child.name}
              node={child}
              depth={depth + 1}
              path={`${path}/${child.name}`}
              expanded={expanded}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// FileManager
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FileManager({ open, onClose }: Props) {
  const projectID = useProjectStore((s) => s.projectID);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(["latest-version"]),
  );

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!projectID) return;
    setLoading(true);
    setError(null);
    try {
      const root = await getProjectRoot(projectID);
      if (!root) {
        setTree([]);
        return;
      }
      const nodes = await buildTree(root);
      setTree(nodes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectID]);

  const handleDelete = useCallback(
    async (path: string) => {
      if (!projectID) return;
      try {
        const root = await getProjectRoot(projectID);
        if (!root) return;

        const segments = path.split("/");
        const targetName = segments.pop()!;

        // Navigate to the parent directory
        let parent = root;
        for (const seg of segments) {
          const d = await getDir(parent, seg);
          if (!d) return;
          parent = d;
        }

        await removeDir(parent, targetName);
        await load();
      } catch {
        // Silently ignore
      }
    },
    [projectID, load],
  );

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const { files, dirs } = countFiles(tree);
  const totalSize = tree.reduce((s, n) => s + n.size, 0);

  return (
    <div
      className="
        fixed inset-0 z-50 flex flex-col
        bg-surface-primary backdrop-blur-md
        text-text-primary font-mono text-xs
      "
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <FolderIcon open />
        <span className="text-sm font-semibold tracking-wide text-text-primary flex-1">
          Files
        </span>
        <span className="text-[10px] text-text-muted tabular-nums mr-2">
          {dirs} dirs · {files} files · {humanSize(totalSize)}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="flex items-center justify-center py-12 text-text-muted">
            Reading files…
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12 text-status-red/70">
            {error}
          </div>
        )}

        {!loading && !error && tree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted/50">
            <FileIcon />
            <span>No files saved yet</span>
          </div>
        )}

        {!loading &&
          !error &&
          tree.map((node) => (
            <TreeRow
              key={node.name}
              node={node}
              depth={0}
              path={node.name}
              expanded={expanded}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border text-[10px] text-text-muted/60 shrink-0">
        project/{projectID ?? "…"}
      </div>
    </div>
  );
}
