import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout() {
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <div className={`max-w-7xl mx-auto animate-fade-in ${isMobile ? "p-4 pt-14" : "p-6 lg:p-8"}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
