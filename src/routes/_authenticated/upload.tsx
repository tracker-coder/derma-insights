import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Upload Data — DermaSpa Insights" },
      { name: "description", content: "Import visit, treatment and revenue exports from your practice software." },
      { property: "og:title", content: "Upload Data — DermaSpa Insights" },
      { property: "og:description", content: "Import visit, treatment and revenue exports from your practice software." },
    ],
  }),
  component: () => (
    <>
      <PageHeader
        title="Upload Data"
        subtitle="Bring in exports from your practice management software."
      />
      <EmptyStateCard
        title="No uploads yet"
        description="This page will let you drop in CSV exports of appointments, treatments and payments, map the columns once, and review a preview before importing. Past uploads and their import status will be listed here."
      />
    </>
  ),
});
