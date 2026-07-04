import {
  LayoutDashboard,
  Store,
  FlaskConical,
  CalendarClock,
  Activity,
  Settings,
} from "lucide-react";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const topItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "store", icon: Store, label: "Script Store" },
  { id: "testlab", icon: FlaskConical, label: "Test Lab" },
  { id: "jobs", icon: CalendarClock, label: "Jobs" },
  { id: "activity", icon: Activity, label: "Activity" },
] as const;

const bottomItems = [
  { id: "settings", icon: Settings, label: "Settings" },
] as const;

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const renderItem = (item: { id: string; icon: React.ElementType; label: string }) => {
    const Icon = item.icon;
    const isActive = activePage === item.id;
    return (
      <button
        key={item.id}
        className={`sidebar__item${isActive ? " sidebar__item--active" : ""}`}
        onClick={() => onNavigate(item.id)}
      >
        <Icon size={20} />
        <span className="sidebar__tooltip">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="sidebar">
      {topItems.map(renderItem)}
      <div className="sidebar__spacer" />
      {bottomItems.map(renderItem)}
    </nav>
  );
}
