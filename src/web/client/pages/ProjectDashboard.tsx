import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project } from "../stores/useProjectStore";
import { BlenderReceiver } from "./BlenderReceiver";
import {
  ArrowLeftIcon,
  CubeIcon,
  GlobeIcon,
  UserIcon,
  ImageIcon,
  UploadIcon,
  HardDriveIcon,
  LayoutDashboardIcon,
  SearchIcon,
  PlusIcon,
  ArrowRightIcon,
  FolderOpenIcon,
  RadioIcon,
} from "../../components/Icons";

// ---------------------------------------------------------------------------
// WordPress admin palette
// ---------------------------------------------------------------------------
const t = {
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
interface NavItem {
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
// Recent activity mock data
// ---------------------------------------------------------------------------
interface ActivityItem {
  id: string;
  type: "prop" | "environment" | "avatar" | "media";
  name: string;
  action: "added" | "updated" | "deleted";
  date: string;
  size?: string;
}

const mockActivity: ActivityItem[] = [
  {
    id: "1",
    type: "prop",
    name: "vintage_chair.fbx",
    action: "added",
    date: "2 hours ago",
    size: "2.4 MB",
  },
  {
    id: "2",
    type: "environment",
    name: "forest_scene.blend",
    action: "updated",
    date: "5 hours ago",
    size: "18.7 MB",
  },
  {
    id: "3",
    type: "avatar",
    name: "player_rig.glb",
    action: "added",
    date: "Yesterday",
    size: "4.1 MB",
  },
  {
    id: "4",
    type: "media",
    name: "wood_texture_albedo.png",
    action: "added",
    date: "Yesterday",
    size: "8.2 MB",
  },
  {
    id: "5",
    type: "prop",
    name: "street_lamp.obj",
    action: "deleted",
    date: "2 days ago",
    size: "—",
  },
  {
    id: "6",
    type: "environment",
    name: "studio_hdri.exr",
    action: "added",
    date: "3 days ago",
    size: "32.0 MB",
  },
  {
    id: "7",
    type: "avatar",
    name: "npc_merchant.fbx",
    action: "updated",
    date: "4 days ago",
    size: "3.8 MB",
  },
];

// ---------------------------------------------------------------------------
// Quick stats card
// ---------------------------------------------------------------------------
interface StatCard {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ProjectDashboard() {
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
  // Loading state
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
  // Error state
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
  // Stats
  // -------------------------------------------------------------------
  const stats: StatCard[] = [
    {
      label: "3D Props",
      count: 24,
      icon: CubeIcon,
      accent: "bg-[#2271b1]/15 text-[#2271b1]",
    },
    {
      label: "Environments",
      count: 8,
      icon: GlobeIcon,
      accent: "bg-[#00a32a]/15 text-[#008a20]",
    },
    {
      label: "Avatars",
      count: 12,
      icon: UserIcon,
      accent: "bg-[#dba617]/15 text-[#bd8600]",
    },
    {
      label: "Media Files",
      count: 47,
      icon: ImageIcon,
      accent: "bg-[#646970]/15 text-[#3c434a]",
    },
  ];

  const totalFiles = stats.reduce((sum, s) => sum + s.count, 0);
  const totalSize = "68.2 MB";

  // -------------------------------------------------------------------
  // Activity helpers
  // -------------------------------------------------------------------
  const typeMeta: Record<
    ActivityItem["type"],
    { icon: React.ComponentType<{ className?: string }>; color: string }
  > = {
    prop: { icon: CubeIcon, color: "text-[#2271b1]" },
    environment: { icon: GlobeIcon, color: "text-[#00a32a]" },
    avatar: { icon: UserIcon, color: "text-[#bd8600]" },
    media: { icon: ImageIcon, color: "text-[#3c434a]" },
  };

  const actionColor: Record<ActivityItem["action"], string> = {
    added: "bg-[#edfaef] text-[#008a20]",
    updated: "bg-[#e5f0fa] text-[#135e96]",
    deleted: "bg-[#fcf0f1] text-[#b32d2e]",
  };

  // -------------------------------------------------------------------
  // Render
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
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveNav(item.label)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    activeNav === item.label
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
          <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
            {/* ------------------------------------------------------------- */}
            {/* Page title */}
            {/* ------------------------------------------------------------- */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className={`text-2xl font-bold ${t.heading}`}>Dashboard</h1>
                <p className={`text-sm ${t.muted} mt-0.5`}>
                  Overview of your project assets and activity
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`inline-flex items-center gap-1.5 px-3 py-2 ${t.border} border ${t.surface} ${t.text} rounded-lg text-sm font-medium ${t.hover} transition-colors`}
                >
                  <UploadIcon className="w-4 h-4" />
                  Import Assets
                </button>
                <button
                  className={`inline-flex items-center gap-1.5 px-3 py-2 ${t.accent} text-white rounded-lg text-sm font-medium transition-colors`}
                >
                  <PlusIcon className="w-4 h-4" />
                  Add New
                </button>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* Stats grid — "At a Glance" */}
            {/* ------------------------------------------------------------- */}
            <div className="grid grid-cols-4 gap-4">
              {stats.map((stat) => (
                <button
                  key={stat.label}
                  onClick={() => setActiveNav(stat.label)}
                  className={`${t.surface} ${t.border} border rounded-xl p-5 text-left hover:shadow-md hover:border-[#2271b1] transition-all space-y-3`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider ${t.muted}`}
                    >
                      {stat.label}
                    </span>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.accent}`}
                    >
                      <stat.icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <p className={`text-3xl font-bold ${t.heading}`}>
                      {stat.count}
                    </p>
                    <p className={`text-[11px] ${t.subtle} mt-0.5`}>
                      {stat.label === "Media Files" ? "items" : "assets"}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* Two-column: Activity + Quick Info */}
            {/* ------------------------------------------------------------- */}
            <div className="grid grid-cols-3 gap-6">
              {/* Recent Activity — takes 2/3 */}
              <div className="col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2
                    className={`text-sm font-semibold uppercase tracking-wider ${t.muted}`}
                  >
                    Recent Activity
                  </h2>
                  <Link
                    to={`/projects/${projectID}/editor`}
                    className={`inline-flex items-center gap-1 text-xs ${t.accentText} hover:underline transition-colors`}
                  >
                    View all
                    <ArrowRightIcon className="w-3 h-3" />
                  </Link>
                </div>

                <div
                  className={`${t.surface} ${t.border} border rounded-xl overflow-hidden`}
                >
                  {/* Search */}
                  <div
                    className={`px-4 py-3 ${t.panelBg} border-b ${t.panelBorder}`}
                  >
                    <div className="relative">
                      <SearchIcon
                        className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${t.subtle}`}
                      />
                      <input
                        type="text"
                        placeholder="Search assets..."
                        className={`w-full pl-8 pr-3 py-1.5 text-sm ${t.surface} border ${t.border} rounded-lg focus:outline-none focus:border-[#2271b1] ${t.text} placeholder:${t.subtle}`}
                      />
                    </div>
                  </div>

                  {/* Activity table */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`${t.panelBg} border-b ${t.panelBorder}`}>
                        <th
                          className={`text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider ${t.muted}`}
                        >
                          File
                        </th>
                        <th
                          className={`text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider ${t.muted}`}
                        >
                          Type
                        </th>
                        <th
                          className={`text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider ${t.muted}`}
                        >
                          Action
                        </th>
                        <th
                          className={`text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider ${t.muted}`}
                        >
                          Size
                        </th>
                        <th
                          className={`text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider ${t.muted}`}
                        >
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockActivity.map((item) => {
                        const meta = typeMeta[item.type];
                        const TypeIcon = meta.icon;
                        return (
                          <tr
                            key={item.id}
                            className={`border-b ${t.panelBorder} ${t.hover} transition-colors`}
                          >
                            <td className="px-4 py-2.5">
                              <span className={`${t.text} text-sm`}>
                                {item.name}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 text-xs ${meta.color}`}
                              >
                                <TypeIcon className="w-3 h-3" />
                                {item.type}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${actionColor[item.action]}`}
                              >
                                {item.action}
                              </span>
                            </td>
                            <td className={`px-4 py-2.5 text-xs ${t.subtle}`}>
                              {item.size}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-xs ${t.subtle} text-right`}
                            >
                              {item.date}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Info sidebar — takes 1/3 */}
              <div className="space-y-4">
                <h2
                  className={`text-sm font-semibold uppercase tracking-wider ${t.muted}`}
                >
                  At a Glance
                </h2>

                {/* Summary card */}
                <div
                  className={`${t.surface} ${t.border} border rounded-xl p-5 space-y-4`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#2271b1]/15 flex items-center justify-center">
                      <HardDriveIcon className="w-5 h-5 text-[#2271b1]" />
                    </div>
                    <div>
                      <p className={`text-xs ${t.subtle}`}>Total Storage</p>
                      <p className={`text-lg font-bold ${t.heading}`}>
                        {totalSize}
                      </p>
                    </div>
                  </div>

                  <div className={`border-t ${t.panelBorder}`} />

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className={t.muted}>Total Files</span>
                      <span className={`font-semibold ${t.heading}`}>
                        {totalFiles}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={t.muted}>Last Updated</span>
                      <span className={`font-semibold ${t.heading}`}>
                        2 hours ago
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={t.muted}>Project Folder</span>
                      <span
                        className={`font-mono text-xs ${t.muted} truncate max-w-35`}
                      >
                        {project.folderPath || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Draft / Actions card */}
                <div
                  className={`${t.surface} ${t.border} border rounded-xl p-5 space-y-3`}
                >
                  <h3
                    className={`text-xs font-semibold uppercase tracking-wider ${t.muted}`}
                  >
                    Quick Actions
                  </h3>
                  <div className="space-y-1.5">
                    <button
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${t.text} ${t.hover} transition-colors text-left`}
                    >
                      <UploadIcon className="w-4 h-4 text-[#2271b1]" />
                      Import 3D Props
                    </button>
                    <button
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${t.text} ${t.hover} transition-colors text-left`}
                    >
                      <UploadIcon className="w-4 h-4 text-[#00a32a]" />
                      Import Environment
                    </button>
                    <button
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${t.text} ${t.hover} transition-colors text-left`}
                    >
                      <UploadIcon className="w-4 h-4 text-[#dba617]" />
                      Import Avatar
                    </button>
                    <button
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${t.text} ${t.hover} transition-colors text-left`}
                    >
                      <UploadIcon className="w-4 h-4 text-[#646970]" />
                      Import Media
                    </button>
                  </div>
                  <div className={`border-t ${t.panelBorder}`} />
                  <Link
                    to={`/projects/${projectID}/editor`}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 ${t.accent} text-white rounded-lg text-sm font-medium transition-colors`}
                  >
                    Open Editor
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
