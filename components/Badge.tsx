import { ReactNode } from "react";

type BadgeVariant =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "outline";

type BadgeSize = "sm" | "md" | "lg";

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

const sizeMap: Record<BadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

const variantMap: Record<BadgeVariant, string> = {
  neutral:
    "bg-surface text-text border-muted/30",
  primary:
    "bg-primary/15 text-primary border-primary/30",
  accent:
    "bg-accent/15 text-accent border-accent/30",
  success:
    "bg-success/15 text-success border-success/30",
  warning:
    "bg-warning/15 text-warning border-warning/30",
  danger:
    "bg-danger/15 text-danger border-danger/30",
  muted:
    "bg-muted/15 text-muted border-muted/30",
  outline:
    "bg-transparent text-text border-muted/30",
};

export default function Badge({
  children,
  variant = "neutral",
  size = "md",
  dot = false,
  leadingIcon,
  trailingIcon,
  className = "",
  ...rest
}: BadgeProps) {
  const base =
    "inline-flex items-center gap-1 rounded-xl border whitespace-nowrap transition-colors duration-200";
  const cls = [base, sizeMap[size], variantMap[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls} data-variant={variant} {...rest}>
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
      )}
      {leadingIcon && <span className="-ml-0.5 mr-0.5 inline-flex">{leadingIcon}</span>}
      <span>{children}</span>
      {trailingIcon && <span className="ml-0.5 inline-flex">{trailingIcon}</span>}
    </span>
  );
}
