import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — DermaSpa Insights" },
      { name: "description", content: "Headline performance metrics for your medical spa." },
      { property: "og:title", content: "Dashboard — DermaSpa Insights" },
      { property: "og:description", content: "Headline performance metrics for your medical spa." },
    ],
  }),
  component: () => (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="A single view of revenue, visits and retention across the selected period."
      />
      <EmptyStateCard
        title="No metrics yet"
        description="Once monthly inputs and visit data are uploaded, this page will show headline KPIs — revenue, new vs. returning patients, average ticket, rebooking rate — plus trends against the previous period."
      />
    </>
  ),
});
