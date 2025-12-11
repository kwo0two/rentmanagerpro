import { NewBuildingForm } from "@/components/buildings/new-building-form";
import { AppHeader } from "@/components/app-header";

export default function NewBuildingPage() {
  return (
    <>
      <AppHeader title="새 건물 추가" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <NewBuildingForm />
      </main>
    </>
  );
}
