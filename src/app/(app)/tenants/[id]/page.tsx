'use client';

import { AppHeader } from "@/components/app-header";
import { TenantLedger } from "@/components/tenants/tenant-ledger";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <AppHeader title="임차인 원장" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
          <TenantLedger tenantId={params.id} />
        </Suspense>
      </main>
    </>
  );
}
