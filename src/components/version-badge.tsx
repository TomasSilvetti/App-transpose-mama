"use client";

import { useEffect, useState } from "react";

/** Versión instalada, visible de un vistazo al abrir para saber si es la última. */
export function VersionBadge() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.transpose?.getAppVersion().then(setVersion);
  }, []);

  if (!version) return null;

  return (
    <span className="rounded-full border border-border-subtle bg-surface-raised/60 px-2.5 py-1 text-xs font-medium tabular-nums text-ink-muted">
      v{version}
    </span>
  );
}
