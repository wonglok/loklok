import type { ComponentType } from "react";
import {
  CubeIcon,
  GlobeIcon,
  UserIcon,
  ImageIcon,
} from "../../../components/Icons";

// ---------------------------------------------------------------------------
// Asset catalogue — the single source of truth for the project's four asset
// classes.  Consumed by the sidebar nav, the dashboard tiles, and the per-type
// asset pages.  Counts stand in for a live asset index (no backend yet).
// ---------------------------------------------------------------------------

export interface AssetType {
  key: string;
  label: string;
  count: number;
  hint: string;
  description: string;
  empty: string;
  icon: ComponentType<{ className?: string }>;
  url: string;
}

export const assetCatalog: AssetType[] = [
  {
    key: "props",
    label: "3D Props",
    count: 24,
    hint: "Meshes & geometry",
    description: "Meshes, objects and geometry synced from Blender.",
    empty: "Send meshes and objects from Blender and they'll appear here.",
    icon: CubeIcon,
    url: "props",
  },
  {
    key: "environments",
    label: "Environments",
    count: 8,
    hint: "Scenes & worlds",
    description: "World scenes and environment geometry synced from Blender.",
    empty: "Sync environment scenes from Blender to see them listed here.",
    icon: GlobeIcon,
    url: "environments",
  },
  {
    key: "avatars",
    label: "Avatars",
    count: 12,
    hint: "Rigs & characters",
    description: "Character rigs and avatar meshes synced from Blender.",
    empty: "Send character rigs from Blender and they'll show up here.",
    icon: UserIcon,
    url: "avatars",
  },
  {
    key: "media",
    label: "Media",
    count: 47,
    hint: "Textures & images",
    description: "Textures, images and material maps synced from Blender.",
    empty: "Textures and images you push from Blender land here.",
    icon: ImageIcon,
    url: "media",
  },
];

export const totalAssets = assetCatalog.reduce((sum, a) => sum + a.count, 0);
