"use client";

import { cn } from "@/lib/utils";
import { QUALITY_LABELS, videoQualitySchema, type VideoQuality } from "@/lib/youtube";

type QualityPickerProps = {
  value: VideoQuality;
  onChange: (value: VideoQuality) => void;
  disabled: boolean;
};

export function QualityPicker({ value, onChange, disabled }: QualityPickerProps) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="mb-2 text-xs uppercase tracking-wide text-ink-muted">
        Calidad del video
      </legend>
      <div className="flex flex-wrap gap-2">
        {videoQualitySchema.options.map((option) => {
          const { label, hint } = QUALITY_LABELS[option];
          const isActive = option === value;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option)}
              className={cn(
                "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40",
                isActive
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-border-subtle text-ink-muted hover:border-accent/50 hover:text-ink",
              )}
            >
              <span className="text-sm font-medium">{label}</span>
              <span className="text-[11px] text-ink-muted">{hint}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">
        Más calidad tarda más en cargar. Se aplica a la próxima canción que abras.
      </p>
    </fieldset>
  );
}
