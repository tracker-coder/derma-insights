import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { PageHeader, EmptyStateCard } from "@/components/PageHeader";
import { useProfile } from "@/hooks/useProfile";
import { listProfiles, inviteUser, updateUserRole, type AppRole } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DermaSpa Insights" },
      { name: "description", content: "Workspace settings and team access for DermaSpa Insights." },
      { property: "og:title", content: "Settings — DermaSpa Insights" },
      { property: "og:description", content: "Workspace settings and team access for DermaSpa Insights." },
    ],
  }),
  component: SettingsPage,
});

function UsersSection() {
  const queryClient = useQueryClient();
  const fetchProfiles = useServerFn(listProfiles);
  const invite = useServerFn(inviteUser);
  const setRole = useServerFn(updateUserRole);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole_] = useState<AppRole>("viewer");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => fetchProfiles(),
  });

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { email, fullName, role } }),
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      setFullName("");
      setRole_("viewer");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole }) => setRole({ data: vars }),
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-6 md:p-8">
      <h2 className="text-base font-semibold">Users</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Invite teammates by email and choose what they can do. Admins manage users; viewers can read
        the dashboards.
      </p>

      <form
        className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr_0.8fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          inviteMutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@dermaspa.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-name">Full name</Label>
          <Input
            id="invite-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole_(v as AppRole)}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={inviteMutation.isPending}>
          {inviteMutation.isPending ? "Sending…" : "Send invite"}
        </Button>
      </form>

      <div className="mt-8 divide-y divide-border rounded-xl border border-border">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading team…</p>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No users yet.</p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{u.full_name ?? u.email}</div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
              </div>
              <Select
                value={u.role}
                onValueChange={(v) => roleMutation.mutate({ userId: u.id, role: v as AppRole })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsPage() {
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <>
      <PageHeader title="Settings" subtitle="Workspace preferences and team access." />
      <div className="space-y-6">
        <InternalTreatmentsSection isAdmin={isAdmin} />
        <CategoryMappingSection isAdmin={isAdmin} />
        <KpiTargetsSection isAdmin={isAdmin} />
        {isAdmin ? (
          <UsersSection />
        ) : (
          <EmptyStateCard
            title="Users"
            description="Only administrators can invite teammates and change roles. Ask an admin if you need access changed."
          />
        )}
      </div>
    </>
  );
}
