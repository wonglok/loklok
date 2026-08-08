"use client";

import { useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { deployProject } from "./DeploySDK";

// ---------------------------------------------------------------------------
// DeployButton — triggers ZIP → OPFS → S3 deploy flow
// ---------------------------------------------------------------------------

function RocketIcon() {
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
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4l.5-2.5L7 8l2.5.5" />
      <path d="M15 12h5l-.5 2.5L17 16l-2.5-.5" />
    </svg>
  );
}

function CheckIcon() {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function DeployButton() {
  const projectID = useProjectStore((s) => s.projectID);
  const [status, setStatus] = useState<"idle" | "deploying" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [deployUrl, setDeployUrl] = useState("");

  const handleDeploy = async () => {
    if (!projectID) return;
    setStatus("deploying");
    setMessage("Zipping scene data…");
    try {
      const result = await deployProject(projectID, (msg) => setMessage(msg));
      if (result) {
        setDeployUrl(`/viewer/${projectID}`);
        setStatus("done");
        setMessage("Deployed!");
      }
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Deploy failed");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  if (status === "done") {
    return (
      <div className="flex items-center gap-1">
        <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-status-green border border-status-green/20 bg-status-green/5">
          <CheckIcon />
          <span>Deployed</span>
        </span>
        <a
          href={deployUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 p-1 rounded-md text-text-muted hover:text-accent transition-colors"
          title="Open viewer"
        >
          <ExternalLinkIcon />
        </a>
      </div>
    );
  }

  return (
    <button
      onClick={handleDeploy}
      disabled={status === "deploying"}
      className={`
        flex items-center gap-1 px-2 py-1 rounded-md
        text-[10px] transition-all duration-150
        ${
          status === "error"
            ? "text-status-red border border-status-red/20 bg-status-red/5"
            : "text-text-muted border border-border bg-surface-secondary hover:text-accent hover:bg-accent-subtle hover:border-accent/20"
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
      title={status === "error" ? message : "Deploy scene"}
    >
      <span className={status === "deploying" ? "animate-spin" : ""}>
        <RocketIcon />
      </span>
      <span className="hidden sm:inline">
        {status === "deploying" ? message : status === "error" ? message : "Deploy"}
      </span>
    </button>
  );
}
