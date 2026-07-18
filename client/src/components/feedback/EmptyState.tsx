import type { LucideIcon } from "lucide-react";
import { Inbox, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  actionLabel,
  onAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 sm:py-24 text-center px-4",
        className
      )}
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-sky-100 rounded-full blur-2xl opacity-50" />
        <div className="relative rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 p-5 ring-1 ring-sky-100">
          <Icon className="w-10 h-10 text-sky-500" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          {description}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        {action ? (
          action
        ) : actionLabel && onAction ? (
          <Button
            onClick={onAction}
            className="gap-2 bg-sky-600 hover:bg-sky-700 text-white"
          >
            <ArrowRight className="w-4 h-4" />
            {actionLabel}
          </Button>
        ) : null}
        {secondaryAction}
      </div>
    </div>
  );
}
