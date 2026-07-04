const managerLabels: Record<string, string> = {
  gpm: "GPM",
  donut: "Donut",
  gpmglobal: "GPM Global",
};

interface ManagerBadgeProps {
  manager: string;
}

export default function ManagerBadge({ manager }: ManagerBadgeProps) {
  return (
    <span className={`badge badge--${manager}`}>
      {managerLabels[manager] ?? manager}
    </span>
  );
}
