import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Stethoscope,
  Users,
  UploadCloud,
  CalendarRange,
  ShieldCheck,
  Settings,
  Menu,
  CalendarDays,
  MapPin,
  UserRound,
  LogOut,
  ChevronDown,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/providers", label: "Providers", icon: Stethoscope },
  { to: "/patients", label: "Patients & Cohorts", icon: Users },
  { to: "/upload", label: "Upload Data", icon: UploadCloud },
  { to: "/monthly-inputs", label: "Monthly Inputs", icon: CalendarRange },
  { to: "/data-health", label: "Data Health", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Wordmark() {
  return (
    <div className="flex items-center gap-3 px-5 py-6">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
        DS
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">DermaSpa</div>
        <div className="text-xs text-muted-foreground">Insights</div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function FilterChip({ icon: Icon, label }: { icon: typeof CalendarDays; label: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground disabled:opacity-100"
    >
      <Icon className="size-3.5" />
      {label}
      <ChevronDown className="size-3.5 opacity-60" />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const initials = (profile?.full_name || profile?.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar lg:flex">
        <Wordmark />
        <NavLinks />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-8">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-sidebar p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Wordmark />
                <NavLinks onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <FilterChip icon={CalendarDays} label="Last 30 days" />
              <FilterChip icon={MapPin} label="All locations" />
              <FilterChip icon={UserRound} label="All providers" />
            </div>

            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 rounded-xl px-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                      {initials}
                    </span>
                    <span className="hidden text-sm sm:inline">
                      {profile?.full_name ?? profile?.email ?? "Account"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="text-sm font-medium">{profile?.full_name ?? "Signed in"}</div>
                    <div className="text-xs text-muted-foreground">{profile?.email}</div>
                    <div className="mt-1 text-xs capitalize text-muted-foreground">
                      Role: {profile?.role ?? "viewer"}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="px-4 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
