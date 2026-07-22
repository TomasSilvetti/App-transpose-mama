"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/types/transpose-api";

/**
 * Avisa de las actualizaciones sin interrumpir. Mientras se descargan no hace falta hacer
 * nada, y la instalación ocurre sola al cerrar la app; el botón solo adelanta ese momento.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => window.transpose?.onUpdateStatus(setStatus), []);

  if (!status || status.phase === "checking" || status.phase === "none") return null;

  // Un fallo al actualizar no impide usar la app, así que no se muestra como error.
  if (status.phase === "error") return null;

  if (status.phase === "ready") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-ink">
        <ArrowUpCircle className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="flex-1">
          Se actualizó a la versión {status.version}. Se aplica sola la próxima vez que abras
          Transpose.
        </span>
        <Button variant="secondary" size="sm" onClick={() => void window.transpose?.installUpdate()}>
          <RefreshCw className="size-4" aria-hidden />
          Reiniciar ahora
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised/60 px-4 py-3 text-sm text-ink-muted">
      <ArrowUpCircle className="size-4 shrink-0 animate-pulse text-accent" aria-hidden />
      <span>
        {status.phase === "downloading"
          ? `Descargando una versión nueva… ${status.percent}%`
          : `Hay una versión nueva (${status.version}). Se descarga sola.`}
      </span>
    </div>
  );
}
