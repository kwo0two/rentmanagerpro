'use client';

import { useFirebase } from '@/firebase';
import { Building, LeaseAgreement } from '@/lib/types';
import { collection, query, where, doc, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Home, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';

export function BuildingsList() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [leases, setLeases] = useState<LeaseAgreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
        if (!firestore || !user) return;
        setIsLoading(true);
        setError(null);
        try {
            const buildingsQuery = query(collection(firestore, 'buildings'), where('ownerId', '==', user.uid));
            const leasesQuery = query(collection(firestore, 'leaseAgreements'), where('ownerId', '==', user.uid));
            
            const [buildingsSnapshot, leasesSnapshot] = await Promise.all([
                getDocs(buildingsQuery),
                getDocs(leasesQuery)
            ]);

            const buildingsData = buildingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Building));
            const leasesData = leasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaseAgreement));

            setBuildings(buildingsData);
            setLeases(leasesData);
        } catch (err: any) {
            console.error("Error fetching buildings data:", err);
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }
    fetchData();
  }, [firestore, user]);


  const tenantCountByBuilding = useMemo(() => {
    if (!leases) return {};
    return leases.reduce((acc, lease) => {
      acc[lease.buildingId] = (acc[lease.buildingId] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
  }, [leases]);

  const handleDeleteBuilding = (buildingId: string, buildingName: string) => {
    if (!firestore || !user) return;
    const buildingRef = doc(firestore, 'buildings', buildingId);
    deleteDocumentNonBlocking(buildingRef, {
        userId: user.uid,
        userEmail: user.email || 'N/A',
        action: 'delete_building',
        details: { buildingId, buildingName },
    });
    // Optimistic update
    setBuildings(prev => prev.filter(b => b.id !== buildingId));
    toast({
        title: "건물 삭제됨",
        description: `${buildingName} 건물이 삭제되었습니다.`,
    });
  };

  if (isLoading) {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-full mt-1" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
  }

  if (error) {
    return (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>오류 발생</AlertTitle>
            <AlertDescription>
                건물 목록을 불러오는 중 오류가 발생했습니다: {error.message}
            </AlertDescription>
        </Alert>
    );
  }

  if (!buildings || buildings.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed shadow-sm p-8 text-center">
            <Home className="w-16 h-16 text-muted-foreground" />
            <h2 className="mt-6 text-xl font-semibold">등록된 건물이 없습니다.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
                새로운 건물을 추가하여 임대 관리를 시작하세요.
            </p>
        </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {buildings.map((building) => (
        <Card key={building.id} className="flex flex-col">
            <div className="flex-grow">
                <CardHeader className="relative pb-2">
                    <Link href={`/buildings/${building.id}/edit`}>
                        <CardTitle>{building.name}</CardTitle>
                        <CardDescription>{building.address}</CardDescription>
                    </Link>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive w-auto px-2 h-auto py-1 absolute top-4 right-4">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    '삭제'를 클릭하면 {building.name} 건물이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteBuilding(building.id, building.name)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    삭제
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">임차인: {tenantCountByBuilding[building.id] || 0}명</p>
                    <p className="text-sm text-muted-foreground">호실: {building.units?.length || 0}개</p>
                </CardContent>
            </div>
        </Card>
      ))}
    </div>
  );
}
