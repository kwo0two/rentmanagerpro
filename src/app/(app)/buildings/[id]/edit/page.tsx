import { AppHeader } from "@/components/app-header";
import { EditBuildingForm } from "@/components/buildings/edit-building-form";

export default function EditBuildingPage({ params }: { params: { id: string } }) {
  return (
    <>
      <AppHeader title="건물 정보 수정" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <EditBuildingForm buildingId={params.id} />
      </main>
    </>
  );
}
