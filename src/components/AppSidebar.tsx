import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, Calendar, Settings, LogOut, ChevronLeft, ChevronRight, Menu, X
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import logo from "@/assets/logo_dkvn.png";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/members", icon: Users, label: "Leden" },
  { to: "/events", icon: Calendar, label: "Events" },
  { to: "/settings", icon: Settings, label: "Instellingen" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut, profile } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Mobile: hamburger button + overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Hamburger button */}
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-sidebar text-sidebar-foreground shadow-lg"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>

        {/* Overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative z-10 flex flex-col bg-sidebar text-sidebar-foreground w-72 h-full shadow-2xl animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2 min-w-0">
                  <img src={logo} alt="De Kunst van Netwerken" className="h-9 w-9 flex-shrink-0 rounded" />
                  <span className="text-sm font-bold text-sidebar-primary truncate">De Kunst van Netwerken</span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground"
                >
                  <X size={18} />
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
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>

              <div className="p-3 border-t border-sidebar-border">
                {profile && (
                  <div className="mb-2 px-2 text-xs text-sidebar-foreground/60 truncate">
                    {profile.first_name} {profile.last_name}
                  </div>
                )}
                <button
                  onClick={signOut}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-accent-foreground transition-colors"
                >
                  <LogOut size={18} />
                  <span>Uitloggen</span>
                </button>
              </div>
            </aside>
          </div>
        )}
      </>
    );
  }

  // Desktop: collapsible sidebar
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
