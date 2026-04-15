import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Bot, BarChart3, Settings, Shield, LogOut, Zap, Menu, X, BookOpen, Sun, Moon
} from "lucide-react";
import { useState } from "react";
import asdLogo from "@assets/ASD_1776259528019.png";

const navItems = [
  { path: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { path: "/bots", label: "Bots", icon: Bot },
  { path: "/trades", label: "Operaciones", icon: BarChart3 },
  { path: "/settings", label: "Ajustes", icon: Settings },
  { path: "/manual", label: "Manual", icon: BookOpen },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allNav = isAdmin ? [...navItems, { path: "/admin", label: "Administración", icon: Shield }] : navItems;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform lg:translate-x-0 lg:static ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <Zap className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">ScalpAI</span>
        </div>
        <nav className="p-4 space-y-1">
          {allNav.map(({ path, label, icon: Icon }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link key={path} href={path} onClick={() => setMobileOpen(false)}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t space-y-1">
          <div className="text-xs text-muted-foreground mb-2 truncate px-3">{user?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={toggleTheme}
            data-testid="button-theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" /> Cerrar Sesión
          </Button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="lg:hidden flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="font-bold">ScalpAI</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(!mobileOpen)} data-testid="button-menu">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6" data-testid="main-content">
          {children}
        </main>
        <footer className="border-t bg-card px-4 py-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <img src={asdLogo} alt="ASD" className="h-4 w-auto" />
          <span>© {new Date().getFullYear()} Atreyu Servicios Digitales</span>
        </footer>
      </div>
    </div>
  );
}
