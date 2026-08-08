"use client";

import { useEffect, useState, use } from "react";
import { useParams, Link } from "react-router-dom";
import JSZip from "jszip";
import { CanvasGPU } from "../../../components/blender/CanvasGPU";
import { OrbitControls } from "@react-three/drei";
import { ViewerRenderer } from "./ViewerRenderer";
import type { LoadedProjectData } from "../../../components/workspace/ProjectSaveData";
import type {
  GeoBuffer,
  TextureData,
} from "../../../components/types/blenderTypes";

// ---------------------------------------------------------------------------
// Viewer page — public 3D scene viewer loading from S3 ZIP
// ---------------------------------------------------------------------------

interface DeployInfo {
  projectID: string;
  name: string;
  deployment: {
    deployID: string;
    url: string;
    size: number;
    objectCount: number;
    createdAt: string;
  };
}

// ---------------------------------------------------------------------------
// ZIP extraction
// ---------------------------------------------------------------------------

function humanSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function extractZip(url: string): Promise<LoadedProjectData | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch deployment ZIP");

  const blob = await res.blob();
  const zip = await JSZip.loadAsync(blob);

  // Parse scene.json
  const sceneFile = zip.file("scene.json");
  if (!sceneFile) throw new Error("scene.json not found in ZIP");
  const sceneJson = JSON.parse(await sceneFile.async("string"));

  // Parse manifest.json
  const manifestFile = zip.file("manifest.json");
  const manifest = manifestFile
    ? JSON.parse(await manifestFile.async("string"))
    : null;

  // Read geometry buffers
  const geoBuffers = new Map<string, GeoBuffer>();
  if (manifest?.geoFiles) {
    for (const entry of manifest.geoFiles) {
      const geoFile = zip.file(`geo/${entry.file}`);
      if (!geoFile) continue;
      const data = await geoFile.async("arraybuffer");
      const vBytes = entry.vCount * 3 * 4;
      const vertices = new Float32Array(data, 0, entry.vCount * 3);
      const indices = new Uint32Array(data, vBytes, entry.iCount);
      let uvs: Float32Array | undefined;
      if (entry.hasUVs) {
        uvs = new Float32Array(
          data,
          vBytes + entry.iCount * 4,
          entry.vCount * 2,
        );
      }
      geoBuffers.set(entry.objectName, {
        version: entry.version,
        vertices,
        indices,
        uvs,
      });
    }
  }

  // Read textures
  const texData = new Map<string, TextureData>();
  if (manifest?.texFiles) {
    for (const entry of manifest.texFiles) {
      const texFile = zip.file(`tex/${entry.binFile}`);
      if (!texFile) continue;
      const bytes = await texFile.async("arraybuffer");
      texData.set(entry.name, { mime: entry.mime, bytes });
    }
  }

  // Read HDR
  let hdrData = null;
  const hdrFile = zip.file("hdr.bin");
  if (hdrFile && sceneJson.hdrWidth && sceneJson.hdrHeight) {
    hdrData = {
      width: sceneJson.hdrWidth,
      height: sceneJson.hdrHeight,
      pixels: await hdrFile.async("arraybuffer"),
    };
  }

  return {
    sceneData: { objects: sceneJson.objects },
    lights: sceneJson.lights ?? [],
    cameras: sceneJson.cameras ?? [],
    hdrData,
    hdrIntensity: sceneJson.hdrIntensity ?? 1,
    geoBuffers,
    texData,
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function SpinnerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function HomeIcon() {
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
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function ViewerPage() {
  const { projectID } = useParams<{ projectID: string }>();
  const [info, setInfo] = useState<DeployInfo | null>(null);
  const [data, setData] = useState<LoadedProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!projectID) return;
    let cancelled = false;

    async function load() {
      try {
        // 1. Get deployment URL from API
        setProgress("Loading deployment info…");
        const res = await fetch(`/api/viewer/${projectID}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to load deployment");
        }
        const deployInfo: DeployInfo = await res.json();
        if (cancelled) return;
        setInfo(deployInfo);

        // 2. Fetch and extract ZIP
        setProgress("Downloading scene data…");
        const loadedData = await extractZip(deployInfo.deployment.url);
        if (cancelled) return;
        setData(loadedData);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectID]);

  return (
    <div className="w-screen h-screen relative">
      {/* Viewer overlay bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-surface-primary/90 backdrop-blur-sm border-b border-border text-xs font-mono">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors"
        >
          <HomeIcon />
        </Link>
        <span className="text-text-muted/40">|</span>
        <span className="text-text-secondary">{info?.name ?? projectID}</span>
        {info && (
          <span className="text-text-muted/60">
            {info.deployment.objectCount} objects ·{" "}
            {humanSize(info.deployment.size)}
          </span>
        )}
      </div>

      <div className="w-full h-full">
        <CanvasGPU>
          {data && <ViewerRenderer data={data} />}
          <OrbitControls target={[0, 1, 0]} makeDefault />
        </CanvasGPU>
      </div>

      {/* Loading / error popup */}
      {(loading || error) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-primary/80 backdrop-blur-sm">
          <div
            className="
              flex flex-col items-center gap-4
              w-[340px] px-8 py-8
              bg-surface-primary border border-border
              rounded-xl shadow-lg
              text-text-primary font-mono text-xs
            "
          >
            {error ? (
              <>
                <div className="w-10 h-10 rounded-full bg-status-red/10 flex items-center justify-center text-status-red">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div className="text-status-red/80 text-center">{error}</div>
                <Link
                  to="/"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-text-muted border border-border hover:text-text-primary hover:bg-surface-secondary transition-all"
                >
                  <HomeIcon />
                  <span>Home</span>
                </Link>
              </>
            ) : (
              <>
                <SpinnerIcon />
                <div className="text-text-muted text-center">{progress}</div>
                {info && (
                  <>
                    <div className="h-1 w-full rounded-full bg-surface-tertiary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent/60 animate-pulse"
                        style={{ width: "60%" }}
                      />
                    </div>
                    <div className="text-center text-[10px] text-text-muted/60">
                      {info.name} · {info.deployment.objectCount} objects ·{" "}
                      {humanSize(info.deployment.size)}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
