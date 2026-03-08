import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Optional right-side content shown in the header even when collapsed */
  headerRight?: ReactNode;
  className?: string;
}

export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
  headerRight,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-xl border border-sidebar-border bg-sidebar overflow-hidden", className)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {headerRight && (
          <div
            className="flex-shrink-0"
            onClick={(e) => e.stopPropagation()} // prevent toggle when interacting with right content
          >
            {headerRight}
          </div>
        )}
      </button>

      {/* Collapsible body */}
      <div
        className={cn(
          "transition-all duration-200 ease-in-out",
          open ? "opacity-100" : "opacity-0 h-0 overflow-hidden pointer-events-none",
        )}
      >
        <div className="border-t border-sidebar-border">
          {children}
        </div>
      </div>
    </div>
  );
}
