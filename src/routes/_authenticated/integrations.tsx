import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, EmptyStateCard } from "@/components/PageHeader";
import { useProfile } from "@/hooks/useProfile";
import { IntegrationsSection } from "@/components/settings/IntegrationsSection";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — DermaSpa Insights" },
      { name: "description", content: "Connect DermaSpa Insights to ChatGPT and other tools." },
      { property: "og:title", content: "Integrations — DermaSpa Insights" },
      { property: "og:description", content: "Connect DermaSpa Insights to ChatGPT and other tools." },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <>
      <PageHeader title="Integrations" subtitle="Connect DermaSpa Insights to external tools like ChatGPT." />
      {isAdmin ? (
        <IntegrationsSection />
      ) : (
        <EmptyStateCard
          title="Integrations"
          description="Only administrators can manage integrations. Ask an admin if you need a connection set up."
        />
      )}
    </>
  );
}
