'use client';
import { AppHeader } from "@/components/app-header";
import { BuildingsList } from "@/components/buildings/buildings-list";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { PlusCircle } from "lucide-react";

export default function BuildingsPage() {
  return (
    <>
      <AppHeader title="건물 관리">
        <Button asChild>
            <Link href="/buildings/new">
                <PlusCircle className="mr-2" />
                건물 추가
            </Link>
        </Button>
      </AppHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <Suspense fallback={<Skeleton className="w-full h-32" />}>
            <BuildingsList />
        </Suspense>
      </main>
    </>
  );
}
