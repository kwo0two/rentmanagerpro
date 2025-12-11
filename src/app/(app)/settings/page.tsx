
import { AppHeader } from "@/components/app-header";
import { DataManagement } from "@/components/settings/data-management";

export default function SettingsPage() {
  return (
    <>
      <AppHeader title="설정" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <DataManagement />
      </main>
    </>
  );
}
