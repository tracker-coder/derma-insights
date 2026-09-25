import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/data-health")({
  head: () => ({
    meta: [
      { title: "Data Health — DermaSpa Insights" },
      { name: "description", content: "Spot gaps, duplicates and stale data before they skew reporting." },
      { property: "og:title", content: "Data Health — DermaSpa Insights" },
      { property: "og:description", content: "Spot gaps, duplicates and stale data before they skew reporting." },
    ],
  }),
  component: () => (
    <>
      <PageHeader
        title="Data Health"
        subtitle="Checks that keep the numbers trustworthy."
      />
      <EmptyStateCard
        title="No checks to show yet"
        description="Once data is flowing, this page will flag missing months, duplicate appointments, unmapped treatment names, providers without hours, and anything else that would distort the dashboard — with a link to fix each issue."
      />
    </>
  ),
});
