import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project } from "../../../stores/useProjectStore";
import { ArrowRightIcon, RadioIcon } from "../../../../components/Icons";
import { assetCatalog as assets, totalAssets } from "../assetCatalog";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

// A wireframe cube drawn as an isometric hexagon — the studio's signature.
function WireCube() {
  return (
    <svg
      width="128"
      height="128"
      viewBox="-60 -60 120 120"
      fill="none"
      aria-hidden="true"
    >
      {/* Translucent faces for depth */}
      <polygon points="0,0 45,-26 0,-52" fill="rgba(129,216,208,0.10)" />
      <polygon points="0,0 45,-26 45,26" fill="rgba(129,216,208,0.06)" />
      <polygon points="0,0 45,26 0,52" fill="rgba(129,216,208,0.03)" />
      {/* Edges */}
      <g
        stroke="#81d8d0"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline
          points="0,-52 45,-26 45,26 0,52 -45,26 -45,-26 0,-52"
          opacity="0.45"
        />
        <line x1="0" y1="0" x2="45" y2="-26" opacity="0.95" />
        <line x1="0" y1="0" x2="45" y2="26" opacity="0.95" />
        <line x1="0" y1="0" x2="-45" y2="26" opacity="0.6" />
      </g>
    </svg>
  );
}

// Blender's red/green/blue axis gizmo, reduced to a quiet corner mark.
function AxisGizmo() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="19" fill="rgba(22,25,26,0.72)" stroke="#2d3132" />
      <g transform="translate(22,22)">
        <line x1="0" y1="0" x2="13" y2="0" stroke="#e06a6a" strokeWidth="1.5" />
        <line x1="0" y1="0" x2="0" y2="-13" stroke="#69c276" strokeWidth="1.5" />
        <line x1="0" y1="0" x2="-9" y2="9" stroke="#5c7fe0" strokeWidth="1.5" />
        <circle r="2.2" fill="#81d8d0" />
      </g>
      <text x="36" y="23" fill="#e06a6a" fontSize="7" fontFamily="monospace">
        X
      </text>
      <text x="22" y="6" fill="#69c276" fontSize="7" fontFamily="monospace">
        Y
      </text>
      <text x="8" y="35" fill="#5c7fe0" fontSize="7" fontFamily="monospace">
        Z
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function Dashboard() {
  const { projectID } = useParams<{ projectID: string }>();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectID}`);
        if (!res.ok) throw new Error("Project not found");
        const data: Project = await res.json();
        if (!cancelled) setProject(data);
      } catch {
        // The shell surfaces load errors; leave the dashboard empty here.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectID]);

  if (!project) return null;

  const meta: Array<[string, string]> = [
    ["Title", project.title],
    ["Folder", project.folderPath || "—"],
    ["Created", formatDate(project.createdAt)],
    ["Updated", formatDate(project.updatedAt)],
  ];

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
      {/* =============================================================== */}
      {/* Hero — live viewport                                             */}
      {/* =============================================================== */}
      <section className="relative overflow-hidden rounded-lg border border-studio-700 bg-studio-850">
        <div className="viewport-grid animate-grid-drift absolute inset-0" />
        <div className="viewport-glow animate-glow-pulse absolute inset-0" />

        <div className="relative p-8 flex flex-col gap-10 min-h-[300px] justify-between">
          {/* Eyebrow + axis */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-tiffany-400">
                Scene · {project.id.slice(0, 8)}
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-ice-50 tracking-tight">
                {project.title}
              </h1>
              <p className="mt-1 text-sm text-ice-400 font-mono truncate">
                {project.folderPath || "No folder selected"}
              </p>
            </div>
            <AxisGizmo />
          </div>

          {/* Cube + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-8">
            <div className="flex items-center gap-5">
              <WireCube />
              <div className="space-y-1 text-xs">
                <p className="text-ice-200 font-medium">Blender sync workspace</p>
                <p className="text-ice-600 font-mono">{totalAssets} assets tracked</p>
              </div>
            </div>

            <Link
              to={`/projects/${projectID}/receiver`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-tiffany-400 hover:bg-tiffany-300 text-studio-900 text-sm font-semibold transition-colors shrink-0"
            >
              <RadioIcon className="w-4 h-4" />
              Open Receiver
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* =============================================================== */}
      {/* Asset tiles                                                      */}
      {/* =============================================================== */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ice-600">
            Assets
          </h2>
          <span className="text-xs font-mono text-ice-600">{totalAssets} total</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {assets.map((asset) => {
            const Icon = asset.icon;
            return (
              <Link
                key={asset.label}
                to={`/projects/${projectID}/${asset.url}`}
                className="group rounded-lg border border-studio-700 bg-studio-850 hover:border-tiffany-500/60 hover:bg-studio-800 transition-colors p-4 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-md bg-tiffany-400/10 border border-tiffany-400/20 flex items-center justify-center text-tiffany-400 group-hover:text-tiffany-300 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-semibold text-ice-50 font-mono leading-none">
                    {asset.count}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-ice-50">{asset.label}</p>
                  <p className="text-xs text-ice-600 mt-0.5">{asset.hint}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* =============================================================== */}
      {/* Properties + sync                                               */}
      {/* =============================================================== */}
      <section className="grid md:grid-cols-2 gap-3">
        {/* Project properties */}
        <div className="rounded-lg border border-studio-700 bg-studio-850 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ice-600">
            Project properties
          </h3>
          <dl className="mt-4 space-y-3">
            {meta.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="text-xs text-ice-600 shrink-0">{label}</dt>
                <dd className="text-[13px] text-ice-200 font-mono truncate">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Blender sync steps */}
        <div className="rounded-lg border border-studio-700 bg-studio-850 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ice-600">
            Blender sync
          </h3>
          <ol className="mt-4 space-y-3">
            {[
              {
                title: "Install the plugin",
                desc: "Download and enable the Blender add-on.",
                href: "/api/blender/plugin.zip",
              },
              {
                title: "Open the Blender Receiver",
                desc: "Live viewport with camera and material sync.",
                href: `/projects/${projectID}/receiver`,
              },
              {
                title: "Send assets from Blender",
                desc: "Props, environments, avatars and media flow in.",
                href: undefined,
              },
            ].map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-tiffany-400/15 border border-tiffany-400/30 text-tiffany-300 text-[11px] font-mono flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  {step.href ? (
                    <Link
                      to={step.href}
                      className="text-[13px] text-ice-50 hover:text-tiffany-300 transition-colors"
                    >
                      {step.title}
                    </Link>
                  ) : (
                    <p className="text-[13px] text-ice-50">{step.title}</p>
                  )}
                  <p className="text-xs text-ice-600 mt-0.5">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
