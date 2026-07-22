"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type SliderProps = Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> & {
  value: number;
  onValueChange: (value: number) => void;
};

/** Range nativo con relleno pintado hasta la posición actual. */
export function Slider({ className, value, onValueChange, min = 0, max = 100, ...props }: SliderProps) {
  const numericMin = Number(min);
  const numericMax = Number(max);
  const filled =
    numericMax === numericMin ? 0 : ((value - numericMin) / (numericMax - numericMin)) * 100;

  return (
    <input
      type="range"
      className={cn("range-track w-full cursor-pointer", className)}
      style={{ "--fill": `${filled}%` } as React.CSSProperties}
      min={min}
      max={max}
      value={value}
      onChange={(event) => onValueChange(Number(event.target.value))}
      {...props}
    />
  );
}
