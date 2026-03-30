import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(73,110,214,0.28)] hover:-translate-y-0.5 hover:bg-primary/90": variant === "default",
            "bg-destructive text-destructive-foreground shadow-[0_10px_22px_rgba(220,68,68,0.22)] hover:-translate-y-0.5 hover:bg-destructive/90": variant === "destructive",
            "surface-control border border-border/70 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground": variant === "outline",
            "bg-secondary text-secondary-foreground shadow-[0_8px_16px_rgba(73,93,142,0.08)] hover:-translate-y-0.5 hover:bg-secondary/88": variant === "secondary",
            "hover:bg-white/60 hover:text-accent-foreground": variant === "ghost",
            "text-primary underline-offset-4 hover:underline": variant === "link",
          },
          {
            "h-9 px-4 py-2": size === "default",
            "h-8 rounded-xl px-3 text-xs": size === "sm",
            "h-10 rounded-2xl px-8": size === "lg",
            "h-9 w-9 rounded-2xl": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
