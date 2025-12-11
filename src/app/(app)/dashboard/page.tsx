'use client';

import { StatCards } from "@/components/dashboard/stat-cards";
import { AllTenantsTable } from "@/components/dashboard/all-tenants-table";
import { columns } from "@/components/dashboard/columns";
import { AppHeader } from "@/components/app-header";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  return (
    <>
      <AppHeader title="대시보드" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <StatCards />
        </Suspense>
        <div className="flex-1 rounded-lg border bg-card p-4 shadow-sm">
            <AllTenantsTable columns={columns as any} />
        </div>
      </main>
    </>
  );
}
