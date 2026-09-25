import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyStateCard } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentsUploader } from "@/components/upload/AppointmentsUploader";
import { SalesUploader } from "@/components/upload/SalesUploader";
import { ImportHistory } from "@/components/upload/ImportHistory";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Upload Data — DermaSpa Insights" },
      { name: "description", content: "Import Jane App appointment, sales and shift reports." },
      { property: "og:title", content: "Upload Data — DermaSpa Insights" },
      { property: "og:description", content: "Import Jane App appointment, sales and shift reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  return (
    <>
      <PageHeader title="Upload Data" subtitle="Bring in exports from Jane App." />
      <Tabs defaultValue="appointments" className="space-y-6">
        <TabsList>
          <TabsTrigger value="appointments">Jane Appointments report</TabsTrigger>
          <TabsTrigger value="sales">Jane Sales report</TabsTrigger>
        </TabsList>
        <TabsContent value="appointments" className="space-y-6">
          {isAdmin ? (
            <AppointmentsUploader />
          ) : (
            <EmptyStateCard title="Admins only" description="Only administrators can import data. You can still review past imports below." />
          )}
          <ImportHistory reportType="appointments" />
        </TabsContent>
        <TabsContent value="sales" className="space-y-6">
          {isAdmin ? (
            <SalesUploader />
          ) : (
            <EmptyStateCard title="Admins only" description="Only administrators can import data. You can still review past imports below." />
          )}
          <ImportHistory reportType="sales" />
        </TabsContent>
      </Tabs>
    </>
  );
}
