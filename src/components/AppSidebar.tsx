import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, Calendar, Settings, LogOut, ChevronLeft, ChevronRight
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo_dkvn.png";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/members", icon: Users, label: "Leden" },
  { to: "/events", icon: Calendar, label: "Events" },
  { to: "/settings", icon: Settings, label: "Instellingen" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { signOut, profile } = useAuth();
  const location = useLocation();

  return (
    <aside className={cn(
      "flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 h-screen sticky top-0",
      collapsed ? "w-16" : "w-80"
    )}>
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed ? (
          <div className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="De Kunst van Netwerken" className="h-9 w-9 flex-shrink-0 rounded" />
            <span className="text-sm font-bold text-sidebar-primary truncate">De Kunst van Netwerken</span>
          </div>
        ) : (
          <img src={logo} alt="De Kunst van Netwerken" className="h-8 w-8 rounded mx-auto" />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground flex-shrink-0"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon size={20} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        {!collapsed && profile && (
          <div className="mb-2 px-2 text-xs text-sidebar-foreground/60 truncate">
            {profile.first_name} {profile.last_name}
          </div>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut size={18} />
          {!collapsed && <span>Uitloggen</span>}
        </button>
      </div>
    </aside>
  );
}
