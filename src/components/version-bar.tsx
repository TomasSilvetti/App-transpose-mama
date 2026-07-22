"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";

import type { UpdateStatus } from "@/types/transpose-api";

/**
 * Muestra siempre la versión instalada y en qué anda el actualizador. Sin esto, "no aparece
 * ningún aviso" es indistinguible de "esta versión todavía no sabe actualizarse".
 */
export function VersionBar() {
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    void window.transpose?.getAppVersion().then(setVersion);
    // El chequeo pudo terminar antes de montar este componente: se pide el estado actual
    // además de suscribirse a los siguientes.
    void window.transpose?.getUpdateStatus().then(setStatus);
    return window.transpose?.onUpdateStatus(setStatus);
  }, []);

  if (!version) return null;

  const detalle = () => {
    switch (status?.phase) {
      case "checking":
        return (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Buscando actualizaciones…
          </>
        );
      case "available":
        return (
          <>
            <RefreshCw className="size-3" aria-hidden />
            Descargando la versión {status.version}…
          </>
        );
      case "downloading":
        return (
          <>
            <RefreshCw className="size-3 animate-spin" aria-hidden />
            Descargando actualización… {status.percent}%
          </>
        );
      case "ready":
        return (
          <>
            <Check className="size-3 text-accent" aria-hidden />
            Versión {status.version} lista para instalarse
          </>
        );
      case "none":
        return (
          <>
            <Check className="size-3 text-accent" aria-hidden />
            Estás al día
          </>
        );
      case "error":
        return <>No pudimos comprobar si hay actualizaciones</>;
      default:
        return null;
    }
  };

  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-4 text-xs text-ink-muted">
      <span className="font-medium text-ink">Transpose {version}</span>
      <span className="flex items-center gap-1.5">{detalle()}</span>
    </footer>
  );
}
