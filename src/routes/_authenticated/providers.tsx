import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/providers")({
  head: () => ({
    meta: [
      { title: "Providers — DermaSpa Insights" },
      { name: "description", content: "Per-provider productivity and retention for your medical spa." },
      { property: "og:title", content: "Providers — DermaSpa Insights" },
      { property: "og:description", content: "Per-provider productivity and retention for your medical spa." },
    ],
  }),
  component: () => (
    <>
      <PageHeader
        title="Providers"
        subtitle="Compare productivity, utilisation and retention by provider."
      />
      <EmptyStateCard
        title="No providers yet"
        description="After your first data upload, each provider will appear here with hours worked, treatments delivered, revenue per hour, and patient rebooking rate — filterable by date range and location."
      />
    </>
  ),
});
