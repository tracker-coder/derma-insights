import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/monthly-inputs")({
  head: () => ({
    meta: [
      { title: "Monthly Inputs — DermaSpa Insights" },
      { name: "description", content: "Enter the monthly figures that analytics can't import automatically." },
      { property: "og:title", content: "Monthly Inputs — DermaSpa Insights" },
      { property: "og:description", content: "Enter the monthly figures that analytics can't import automatically." },
    ],
  }),
  component: () => (
    <>
      <PageHeader
        title="Monthly Inputs"
        subtitle="Figures entered by hand each month, such as marketing spend and staffing costs."
      />
      <EmptyStateCard
        title="Nothing entered yet"
        description="Each month you'll fill in the numbers that don't come from an export — marketing spend, room and staffing costs, product purchases and targets. Saved months will be listed here so you can review or correct them."
      />
    </>
  ),
});
