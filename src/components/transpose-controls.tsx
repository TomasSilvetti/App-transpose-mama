"use client";

import { Minus, Plus, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatSemitones } from "@/lib/utils";
import {
  MAX_SEMITONES,
  MAX_TEMPO,
  MIN_SEMITONES,
  MIN_TEMPO,
} from "@/hooks/use-transpose-player";

type TransposeControlsProps = {
  semitones: number;
  tempo: number;
  disabled: boolean;
  onSemitonesChange: (value: number) => void;
  onSemitonesAdjust: (delta: number) => void;
  onTempoChange: (value: number) => void;
  onReset: () => void;
};

export function TransposeControls({
  semitones,
  tempo,
  disabled,
  onSemitonesChange,
  onSemitonesAdjust,
  onTempoChange,
  onReset,
}: TransposeControlsProps) {
  const magnitude = Math.abs(semitones);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Tono</span>
          <span className="text-xs text-ink-muted">
            {semitones === 0
              ? "Tono original"
              : `${magnitude} semitono${magnitude === 1 ? "" : "s"} ${semitones > 0 ? "arriba" : "abajo"}`}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Bajar un semitono"
            disabled={disabled || semitones <= MIN_SEMITONES}
            onClick={() => onSemitonesAdjust(-1)}
          >
            <Minus className="size-5" aria-hidden />
          </Button>

          <div className="flex flex-1 flex-col items-center">
            <span className="text-4xl font-semibold tabular-nums text-accent">
              {formatSemitones(semitones)}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">semitonos</span>
          </div>

          <Button
            variant="secondary"
            size="icon"
            aria-label="Subir un semitono"
            disabled={disabled || semitones >= MAX_SEMITONES}
            onClick={() => onSemitonesAdjust(1)}
          >
            <Plus className="size-5" aria-hidden />
          </Button>
        </div>

        <Slider
          aria-label="Transposición en semitonos"
          min={MIN_SEMITONES}
          max={MAX_SEMITONES}
          step={1}
          value={semitones}
          onValueChange={onSemitonesChange}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Velocidad</span>
          <span className="text-xs tabular-nums text-ink-muted">{tempo.toFixed(2)}×</span>
        </div>
        <Slider
          aria-label="Velocidad de reproducción"
          min={MIN_TEMPO}
          max={MAX_TEMPO}
          step={0.05}
          value={tempo}
          onValueChange={onTempoChange}
          disabled={disabled}
        />
        <p className="text-xs text-ink-muted">
          La velocidad no altera el tono: podés practicar más lento sin desafinar.
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={disabled || (semitones === 0 && tempo === 1)}
        onClick={onReset}
      >
        <Undo2 className="size-4" aria-hidden />
        Volver al original
      </Button>
    </div>
  );
}
