import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "Patients & Cohorts — DermaSpa Insights" },
      { name: "description", content: "Patient cohorts, retention curves and lifetime value." },
      { property: "og:title", content: "Patients & Cohorts — DermaSpa Insights" },
      { property: "og:description", content: "Patient cohorts, retention curves and lifetime value." },
    ],
  }),
  component: () => (
    <>
      <PageHeader
        title="Patients & Cohorts"
        subtitle="Understand how groups of patients behave over time."
      />
      <EmptyStateCard
        title="No cohorts yet"
        description="Once patient visit history is available, this page will group patients by first-visit month and treatment type, showing retention curves, repeat-visit intervals and lifetime value per cohort."
      />
    </>
  ),
});
