import type { ReactNode } from "react";
import { t } from "../DashUILayout";

interface SubPageProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function SubPage({ title, description, children }: SubPageProps) {
  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className={`text-2xl font-bold ${t.heading}`}>{title}</h1>
        {description && (
          <p className={`text-sm ${t.muted} mt-0.5`}>{description}</p>
        )}
      </div>

      {/* Content */}
      {children && (
        <div className={`${t.surface} ${t.border} border rounded-xl p-6`}>
          {children}
        </div>
      )}

      {/* Empty state */}
      {!children && (
        <div
          className={`${t.surface} ${t.border} border rounded-xl p-12 text-center`}
        >
          <p className={`text-sm ${t.muted}`}>No content yet</p>
          <p className={`text-xs ${t.subtle} mt-1`}>
            This section is under construction
          </p>
        </div>
      )}
    </div>
  );
}
