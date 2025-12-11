'use client';

import * as React from 'react';
import { AppHeader } from "@/components/app-header";
import { PaymentsList } from "@/components/payments/payments-list";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Home, PlusCircle } from "lucide-react";
import { useFirebase } from '@/firebase';
import { Building } from '@/lib/types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PaymentsPage() {
  const { firestore, user } = useFirebase();
  const [selectedBuildingId, setSelectedBuildingId] = React.useState<string | null>(null);
  const [buildings, setBuildings] = React.useState<Building[]>([]);
  const [isLoadingBuildings, setIsLoadingBuildings] = React.useState(true);

  React.useEffect(() => {
    async function fetchBuildings() {
        if (!firestore || !user) return;
        setIsLoadingBuildings(true);
        try {
            const buildingsQuery = query(collection(firestore, 'buildings'), where('ownerId', '==', user.uid));
            const querySnapshot = await getDocs(buildingsQuery);
            const buildingsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Building));
            setBuildings(buildingsData);
            if (buildingsData.length > 0 && !selectedBuildingId) {
                setSelectedBuildingId(buildingsData[0].id);
            }
        } catch (error) {
            console.error("Error fetching buildings:", error);
        } finally {
            setIsLoadingBuildings(false);
        }
    }
    fetchBuildings();
  }, [firestore, user, selectedBuildingId]);


  const headerActions = (
    <>
      <Select 
        onValueChange={setSelectedBuildingId} 
        value={selectedBuildingId || ''}
        disabled={isLoadingBuildings || !buildings || buildings.length === 0}
      >
          <SelectTrigger className="w-[200px] md:w-[280px]">
              <SelectValue placeholder={isLoadingBuildings ? "건물 목록 로딩중..." : "건물을 선택하세요"} />
          </SelectTrigger>
          <SelectContent>
              {buildings?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
      </Select>
      <Button asChild>
          <Link href="/payments/new">
              <PlusCircle className="mr-2" />
              <span className="hidden md:inline">납부 기록 추가</span>
              <span className="inline md:hidden">추가</span>
          </Link>
      </Button>
    </>
  );

  return (
    <>
      <AppHeader title="납부 기록 관리" actions={headerActions} />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <div className="flex-1 rounded-lg border bg-card p-4 shadow-sm">
          {isLoadingBuildings ? (
             <Skeleton className="h-96 w-full" />
          ) : selectedBuildingId ? (
            <Suspense fallback={<Skeleton className="w-full h-96" />}>
              <PaymentsList buildingId={selectedBuildingId} />
            </Suspense>
          ) : (
             <div className="flex flex-col items-center justify-center rounded-lg border border-dashed shadow-sm p-8 text-center h-[400px]">
                <Home className="w-16 h-16 text-muted-foreground" />
                <h2 className="mt-6 text-xl font-semibold">건물을 선택하세요.</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    납부 기록을 보려면 먼저 건물을 선택해야 합니다. 건물이 없다면 먼저 추가해주세요.
                </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
