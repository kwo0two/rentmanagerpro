import { AppHeader } from "@/components/app-header";
import { AuditLogsTable } from "@/components/audit-logs/audit-logs-table";
import { columns } from "@/components/audit-logs/columns";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLogsPage() {
  return (
    <>
      <AppHeader title="활동 기록" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <div className="flex-1 rounded-lg border bg-card p-4 shadow-sm">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <AuditLogsTable columns={columns} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
