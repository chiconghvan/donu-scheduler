import type { ReactNode } from "react";

interface BadgeProps {
  status: string;
  children?: ReactNode;
  dot?: boolean;
}

export default function Badge({ status, children, dot }: BadgeProps) {
  return (
    <span className={`badge badge--${status}`}>
      {dot && <span className="badge__dot" />}
      {children ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
