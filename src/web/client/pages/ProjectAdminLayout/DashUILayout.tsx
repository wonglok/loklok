import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import type { Project } from "../../stores/useProjectStore";
import {
  ArrowLeftIcon,
  CubeIcon,
  LayoutDashboardIcon,
  RadioIcon,
  SettingsIcon,
  ClockIcon,
} from "../../../components/Icons";
import { assetCatalog } from "./assetCatalog";

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------

export interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  url?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Sections encode real structure — what the user manages vs. the assets
// they keep in the project — not decorative grouping.
const navSections: NavSection[] = [
  {
    label: "Project",
    items: [
      { label: "Dashboard", icon: LayoutDashboardIcon, url: "" },
      { label: "Blender Receiver", icon: RadioIcon, url: "receiver" },
    ],
  },
  {
    label: "Assets",
    items: assetCatalog.map((a) => ({
      label: a.label,
      icon: a.icon,
      count: a.count,
      url: a.url,
    })),
  },
  {
    label: "System",
    items: [{ label: "Settings", icon: SettingsIcon, url: "settings" }],
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface DashboardLayoutProps {
  children?: ReactNode;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function DashUILayout({ children }: DashboardLayoutProps) {
  const { projectID } = useParams<{ projectID: string }>();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive active nav from the current route
  const activeNav = (() => {
    const path = location.pathname;
    const base = `/projects/${projectID}`;
    if (path === base || path === `${base}/`) return "Dashboard";
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.url && path === `${base}/${item.url}`) return item.label;
      }
    }
    return "Dashboard";
  })();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectID}`);
        if (!res.ok) throw new Error("Project not found");
        const data: Project = await res.json();
        setProject(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectID]);

  // -------------------------------------------------------------------
  // Loading state (full-screen, no shell)
  // -------------------------------------------------------------------
  if (loading) {
    return (
      <div className="w-screen h-screen bg-studio-900 flex items-center justify-center">
        <p className="text-sm text-ice-400">Loading studio…</p>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Error state (full-screen, no shell)
  // -------------------------------------------------------------------
  if (error || !project) {
    return (
      <div className="w-screen h-screen bg-studio-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-ice-400">{error || "Project not found"}</p>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-tiffany-400 hover:text-tiffany-300 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Full layout — dark Blender studio shell
  // -------------------------------------------------------------------
  return (
    <div className="w-screen h-screen bg-studio-900 text-ice-50 flex flex-col overflow-hidden antialiased">
      {/* ================================================================= */}
      {/* Top bar — breadcrumb + project + last-edited                     */}
      {/* ================================================================= */}
      <header className="shrink-0 h-11 bg-studio-850 border-b border-studio-700 flex items-center justify-between px-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-ice-400 hover:text-ice-50 hover:bg-studio-800 transition-colors shrink-0"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Projects
          </Link>
          <div className="w-px h-4 bg-studio-700" />
          <span className="text-sm font-semibold tracking-tight truncate">
            {project.title}
          </span>
          {project.folderPath && (
            <>
              <div className="w-px h-4 bg-studio-700 hidden sm:block" />
              <span className="hidden sm:block text-xs text-ice-600 font-mono truncate">
                {project.folderPath}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ice-600 shrink-0">
          <ClockIcon className="w-3.5 h-3.5" />
          <span>Edited {formatDate(project.updatedAt)}</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ================================================================= */}
        {/* Left sidebar — sectioned outliner                                 */}
        {/* ================================================================= */}
        <aside className="shrink-0 w-56 bg-studio-850 border-r border-studio-700 flex flex-col overflow-y-auto">
          {/* Brand / project mark */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-tiffany-300 to-tiffany-600 flex items-center justify-center shadow-[0_0_18px_rgba(129,216,208,0.28)]">
                <CubeIcon className="w-4 h-4 text-studio-900" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate">
                  {project.title}
                </p>
                <p className="text-[11px] text-ice-600 leading-tight">
                  B3 workspace
                </p>
              </div>
            </div>
          </div>

          {/* Sectioned nav */}
          <div className="px-2 py-3 space-y-3 flex-1">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ice-600">
                  {section.label}
                </p>
                <nav className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeNav === item.label;
                    const navClasses = `relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors text-left ${
                      active
                        ? "bg-tiffany-400/10 text-tiffany-300"
                        : "text-ice-400 hover:bg-studio-800 hover:text-ice-50"
                    }`;
                    const inner = (
                      <>
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-tiffany-400" />
                        )}
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.count !== undefined && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              active
                                ? "bg-tiffany-400/15 text-tiffany-200"
                                : "bg-studio-800 text-ice-600"
                            }`}
                          >
                            {item.count}
                          </span>
                        )}
                      </>
                    );
                    return (
                      <Link
                        key={item.label}
                        to={`/projects/${projectID}/${item.url}`}
                        className={navClasses}
                      >
                        {inner}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        {/* ================================================================= */}
        {/* Main content area                                                 */}
        {/* ================================================================= */}
        <main className="flex-1 overflow-y-auto bg-studio-950">{children}</main>
      </div>
    </div>
  );
}
