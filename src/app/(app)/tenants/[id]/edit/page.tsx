import { NewTenantForm } from "@/components/tenants/new-tenant-form";
import { AppHeader } from "@/components/app-header";

export default function EditTenantPage({ params }: { params: { id: string } }) {
  return (
    <>
      <AppHeader title="임차인 계약 수정" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <NewTenantForm leaseId={params.id} />
      </main>
    </>
  );
}
