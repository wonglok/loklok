import type { ReactNode } from "react";

interface SubPageProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function SubPage({ title, description, children }: SubPageProps) {
  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      {/* Page header */}
      <header>
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-tiffany-400" />
          <h1 className="text-xl font-semibold text-ice-50 tracking-tight">
            {title}
          </h1>
        </div>
        {description && (
          <p className="text-sm text-ice-400 mt-1.5 pl-3.5">{description}</p>
        )}
      </header>

      {/* Content */}
      {children && (
        <div className="bg-studio-850 border border-studio-700 rounded-lg p-6">
          {children}
        </div>
      )}

      {/* Empty state */}
      {!children && (
        <div className="bg-studio-850 border border-studio-700 rounded-lg p-12 text-center">
          <p className="text-sm text-ice-400">No content yet</p>
          <p className="text-xs text-ice-600 mt-1">
            This section is under construction
          </p>
        </div>
      )}
    </div>
  );
}
