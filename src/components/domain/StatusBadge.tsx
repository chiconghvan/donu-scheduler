import Badge from "../common/Badge";

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <Badge status={status} dot={status === "running"} />;
}
