import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project } from "../../stores/useProjectStore";
import { BlenderReceiver } from "../BlenderReceiver";
import {
  ArrowLeftIcon,
  CubeIcon,
  GlobeIcon,
  UserIcon,
  ImageIcon,
  HardDriveIcon,
  LayoutDashboardIcon,
  FolderOpenIcon,
  RadioIcon,
} from "../../../components/Icons";

// ---------------------------------------------------------------------------
// WordPress admin palette
// ---------------------------------------------------------------------------
export const t = {
  bg: "bg-[#f0f0f1]",
  surface: "bg-white",
  border: "border-[#dcdcde]",
  accent: "bg-[#2271b1] hover:bg-[#135e96]",
  accentText: "text-[#2271b1]",
  accentTextHover: "hover:text-[#135e96]",
  heading: "text-[#1d2327]",
  text: "text-[#3c434a]",
  muted: "text-[#646970]",
  subtle: "text-[#8c8f94]",
  panelBg: "bg-[#f6f7f7]",
  panelBorder: "border-[#dcdcde]",
  hover: "hover:bg-[#f0f0f1]",
  sidebarBg: "bg-[#1d2327]",
  sidebarHover: "hover:bg-[#2c3338]",
  sidebarActive: "bg-[#2271b1]",
  sidebarText: "text-[#f0f0f1]",
  sidebarMuted: "text-[#a7aaad]",
};

// ---------------------------------------------------------------------------
// Sidebar nav item
// ---------------------------------------------------------------------------
export interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

const mainNav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboardIcon },
  { label: "3D Props", icon: CubeIcon, count: 24 },
  { label: "Environments", icon: GlobeIcon, count: 8 },
  { label: "Avatars", icon: UserIcon, count: 12 },
  { label: "Media", icon: ImageIcon, count: 47 },
];

const bottomNav: NavItem[] = [
  { label: "Blender Receiver", icon: RadioIcon },
  { label: "Storage", icon: HardDriveIcon },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface DashboardLayoutProps {
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function DashUILayout({ children }: DashboardLayoutProps) {
  const { projectID } = useParams<{ projectID: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("Dashboard");

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
      <div
        className={`w-screen h-screen ${t.bg} flex items-center justify-center`}
      >
        <p className={`text-sm ${t.muted}`}>Loading dashboard...</p>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Error state (full-screen, no shell)
  // -------------------------------------------------------------------
  if (error || !project) {
    return (
      <div
        className={`w-screen h-screen ${t.bg} flex items-center justify-center`}
      >
        <div className="text-center space-y-3">
          <p className={`text-sm ${t.muted}`}>{error || "Project not found"}</p>
          <Link
            to="/projects"
            className={`inline-flex items-center gap-1.5 text-sm ${t.accentText} hover:underline transition-colors`}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Full layout
  // -------------------------------------------------------------------
  return (
    <div className={`w-screen h-screen ${t.bg} flex flex-col overflow-hidden`}>
      {/* ================================================================= */}
      {/* Top admin bar — WordPress-style */}
      {/* ================================================================= */}
      <header
        className={`shrink-0 h-10 ${t.sidebarBg} flex items-center justify-between px-4 text-xs`}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/projects"
            className={`inline-flex items-center gap-1 ${t.sidebarMuted} hover:text-white transition-colors`}
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Projects
          </Link>
          <div className="w-px h-3.5 bg-white/15" />
          <span className="text-white font-semibold tracking-wide">
            {project.title}
          </span>
          {project.folderPath && (
            <span className={`${t.sidebarMuted} font-mono text-[11px]`}>
              — {project.folderPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-[11px]">
            {new Date(project.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ================================================================= */}
        {/* Left sidebar — WordPress admin menu */}
        {/* ================================================================= */}
        <aside
          className={`shrink-0 w-52 ${t.sidebarBg} flex flex-col overflow-y-auto`}
        >
          {/* Logo / project name area */}
          <div className="px-4 py-4 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#2271b1] flex items-center justify-center">
                <FolderOpenIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold leading-tight truncate">
                  {project.title}
                </p>
                <p className={`${t.sidebarMuted} text-[11px] leading-tight`}>
                  Project Dashboard
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 mx-3" />

          {/* Main nav */}
          <nav className="px-2 py-3 space-y-0.5 flex-1">
            {mainNav.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveNav(item.label)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    active
                      ? `${t.sidebarActive} text-white`
                      : `${t.sidebarText} ${t.sidebarHover}`
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                        active
                          ? "bg-white/20 text-white"
                          : `bg-white/10 ${t.sidebarMuted}`
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom nav */}
          <div className="px-2 pb-4 space-y-0.5">
            <div className="border-t border-white/10 mx-1 mb-3" />
            {bottomNav.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveNav(item.label)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    active
                      ? `${t.sidebarActive} text-white`
                      : `${t.sidebarText} ${t.sidebarHover}`
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ================================================================= */}
        {/* Main content area */}
        {/* ================================================================= */}
        <main className="flex-1 overflow-y-auto">
          {activeNav === "Blender Receiver" ? (
            <div className="w-full h-full">
              <BlenderReceiver />
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
