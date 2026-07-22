import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-surface hover:bg-accent-soft",
        secondary:
          "bg-surface-raised text-ink border border-border-subtle hover:border-accent/60 hover:text-accent-soft",
        ghost: "text-ink-muted hover:bg-surface-raised hover:text-ink",
        danger: "text-ink-muted hover:bg-red-500/10 hover:text-red-400",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-11 px-5",
        icon: "size-11",
        "icon-lg": "size-16 rounded-full",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
