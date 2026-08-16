import { Link, useParams } from "react-router-dom";
import { assetCatalog } from "../assetCatalog";
import { ArrowRightIcon, RadioIcon } from "../../../../components/Icons";

interface AssetPageProps {
  type: string; // "props" | "environments" | "avatars" | "media"
}

export function AssetPage({ type }: AssetPageProps) {
  const { projectID } = useParams<{ projectID: string }>();
  const asset = assetCatalog.find((a) => a.url === type);
  if (!asset) return null;
  const Icon = asset.icon;

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-tiffany-400">
            Assets
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ice-50 tracking-tight">
            {asset.label}
          </h1>
          <p className="text-sm text-ice-400 mt-1.5">{asset.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono px-2 py-1 rounded bg-studio-800 text-ice-400">
            {asset.count}
          </span>
          <Link
            to={`/projects/${projectID}/receiver`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-tiffany-400 hover:bg-tiffany-300 text-studio-900 text-sm font-semibold transition-colors"
          >
            <RadioIcon className="w-4 h-4" />
            Sync from Blender
          </Link>
        </div>
      </header>

      {/* Empty state — an invitation to act, not an apology */}
      <div className="rounded-lg border border-dashed border-studio-600 bg-studio-850/40 px-6 py-20 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-md bg-tiffany-400/10 border border-tiffany-400/20 flex items-center justify-center text-tiffany-400">
          <Icon className="w-6 h-6" />
        </div>
        <p className="text-sm text-ice-200 font-medium">
          No {asset.label} synced yet
        </p>
        <p className="text-xs text-ice-600 max-w-sm">{asset.empty}</p>
        <Link
          to={`/projects/${projectID}/receiver`}
          className="mt-1 inline-flex items-center gap-1.5 text-xs text-tiffany-400 hover:text-tiffany-300 transition-colors"
        >
          Open the Blender Receiver
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
