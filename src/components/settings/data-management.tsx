'use client';

import { useState } from 'react';
import { useFirebase } from '@/firebase';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  query,
  where,
  deleteDoc,
  WriteBatch,
  Timestamp,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Building, LeaseAgreement, Payment, RentAdjustment, UserProfile } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { errorEmitter, FirestorePermissionError } from '@/firebase';


interface BackupData {
  buildings: Building[];
  leaseAgreements: LeaseAgreement[];
  payments: Payment[];
  rentAdjustments: RentAdjustment[];
}

// Helper to convert various date formats from JSON to a Date object
function parseDate(dateValue: any): Date | null {
  if (!dateValue) return null;

  // Case 1: Firestore Timestamp-like object { seconds: ..., nanoseconds: ... }
  if (dateValue.seconds !== undefined && dateValue.nanoseconds !== undefined) {
    return new Timestamp(dateValue.seconds, dateValue.nanoseconds).toDate();
  }
  
  // Case 2: ISO string or other string format
  if (typeof dateValue === 'string') {
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Case 3: Already a Date object (less likely from JSON.parse but good practice)
  if (dateValue instanceof Date) {
    return dateValue;
  }
  
  console.warn("Could not parse date:", dateValue);
  return null;
}


async function deleteCollectionForUser(
    firestore: Firestore, 
    collectionName: string, 
    user: { id: string },
) {
    try {
        const batch = writeBatch(firestore);
        const collectionRef = collection(firestore, collectionName);
        const q = query(collectionRef, where('ownerId', '==', user.id));

        const snapshot = await getDocs(q);
        if (snapshot.empty) return; // Nothing to delete

        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

    } catch (e: any) {
        // Throw a more specific error for debugging
        const specificError = new FirestorePermissionError({
            path: collectionName,
            operation: 'delete',
            requestResourceData: { note: `Failed to batch delete documents for user ${user.id} in ${collectionName}.` }
        });
        errorEmitter.emit('permission-error', specificError);
        // Also re-throw the original error to be caught by the calling function
        throw new Error(`'${collectionName}' 컬렉션 삭제 중 권한 오류가 발생했습니다.`);
    }
}

export function DataManagement() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const handleBackup = async () => {
    if (!firestore || !user) return;
    setIsProcessing(true);
    toast({ title: '백업 시작', description: '데이터를 다운로드합니다.' });

    try {
      const buildingsQuery = query(collection(firestore, 'buildings'), where('ownerId', '==', user.uid));
      const leasesQuery = query(collection(firestore, 'leaseAgreements'), where('ownerId', '==', user.uid));
      const paymentsQuery = query(collection(firestore, 'payments'), where('ownerId', '==', user.uid));
      const adjustmentsQuery = query(collection(firestore, 'rentAdjustments'), where('ownerId', '==', user.uid));

      const [buildingsSnap, leasesSnap, paymentsSnap, adjustmentsSnap] = await Promise.all([
        getDocs(buildingsQuery),
        getDocs(leasesQuery),
        getDocs(paymentsQuery),
        getDocs(adjustmentsQuery),
      ]);

      const buildings = buildingsSnap.docs.map(doc => doc.data() as Building);
      const leaseAgreements = leasesSnap.docs.map(doc => doc.data() as LeaseAgreement);
      const payments = paymentsSnap.docs.map(doc => doc.data() as Payment);
      const rentAdjustments = adjustmentsSnap.docs.map(doc => doc.data() as RentAdjustment);
      
      const backupData: BackupData = { buildings, leaseAgreements, payments, rentAdjustments };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rental-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: '백업 완료', description: '데이터가 성공적으로 백업되었습니다.' });
    } catch (error) {
      console.error('Backup failed:', error);
      toast({ variant: 'destructive', title: '백업 실패', description: `데이터를 백업하는 중 오류가 발생했습니다: ${(error as Error).message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAllData = async (): Promise<boolean> => {
    if (!firestore || !user) {
        toast({ variant: 'destructive', title: '오류', description: '로그인이 필요합니다.' });
        return false;
    }
    
    try {
        const userOwnedCollections = ['buildings', 'leaseAgreements', 'payments', 'rentAdjustments', 'logs'];
        
        for (const name of userOwnedCollections) {
            await deleteCollectionForUser(firestore, name, { id: user.uid });
        }

        return true;
    } catch (error) {
        console.error("Failed to clear data:", error);
        toast({ variant: 'destructive', title: '데이터 삭제 실패', description: `기존 데이터를 삭제하는 중 오류가 발생했습니다: ${(error as Error).message}` });
        return false;
    }
  }


  const handleRestore = async () => {
    if (!uploadFile || !firestore || !user) return;
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const backupData = JSON.parse(event.target?.result as string) as BackupData;
            
            toast({ title: '복원 준비 중', description: '기존 데이터를 삭제합니다...' });
            const cleared = await clearAllData();
            if (!cleared) {
                 setIsProcessing(false);
                 return;
            }
            toast({ title: '데이터 복원 중', description: '백업 파일로부터 데이터를 복원합니다...' });

            const batch = writeBatch(firestore);

            (backupData.buildings || []).forEach(building => {
                const docRef = doc(firestore, 'buildings', building.id || uuidv4());
                batch.set(docRef, { ...building, ownerId: user.uid });
            });

            (backupData.leaseAgreements || []).forEach(lease => {
                const docRef = doc(firestore, 'leaseAgreements', lease.id || uuidv4());
                const startDate = parseDate(lease.leaseStartDate);
                const endDate = parseDate(lease.leaseEndDate);
                
                if (!startDate || !endDate) {
                    throw new Error(`Lease agreement for ${lease.tenantName} has invalid date values.`);
                }

                const restoredLease = {
                    ...lease,
                    ownerId: user.uid,
                    leaseStartDate: Timestamp.fromDate(startDate),
                    leaseEndDate: Timestamp.fromDate(endDate),
                    renewals: (lease.renewals || []).map(r => ({
                        ...r,
                        renewalDate: Timestamp.fromDate(parseDate(r.renewalDate)!),
                        newLeaseEndDate: Timestamp.fromDate(parseDate(r.newLeaseEndDate)!),
                    }))
                };
                batch.set(docRef, restoredLease);
            });

            (backupData.payments || []).forEach(payment => {
                const paymentId = payment.id || uuidv4();
                const docRef = doc(firestore, 'payments', paymentId);
                const paymentDate = parseDate(payment.paymentDate);

                if (!paymentDate) {
                    throw new Error(`Payment with amount ${payment.paymentAmount} has an invalid date value.`);
                }

                const restoredPayment = {
                    ...payment,
                    id: paymentId,
                    ownerId: user.uid,
                    paymentDate: Timestamp.fromDate(paymentDate),
                };
                batch.set(docRef, restoredPayment);
            });

             (backupData.rentAdjustments || []).forEach(adj => {
                const adjId = adj.id || uuidv4();
                const docRef = doc(firestore, 'rentAdjustments', adjId);
                const adjDate = parseDate(adj.adjustmentDate);

                if (!adjDate) {
                    throw new Error(`Adjustment for lease ${adj.leaseAgreementId} has an invalid date value.`);
                }
                const restoredAdj = {
                    ...adj,
                    id: adjId,
                    ownerId: user.uid,
                    adjustmentDate: Timestamp.fromDate(adjDate),
                };
                batch.set(docRef, restoredAdj);
            });
            
            await batch.commit();

            toast({ title: '복원 완료', description: '데이터가 성공적으로 복원되었습니다. 페이지를 새로고침합니다.' });
            setTimeout(() => window.location.reload(), 2000);

        } catch (error) {
            console.error('Restore failed:', error);
            toast({ variant: 'destructive', title: '복원 실패', description: `백업 파일을 처리하는 중 오류가 발생했습니다: ${(error as Error).message}` });
        } finally {
            setIsProcessing(false);
            setUploadFile(null);
        }
    };
    reader.readAsText(uploadFile);
  };

  const handleReset = async () => {
    setIsProcessing(true);
    toast({ title: '초기화 진행 중', description: '모든 데이터를 삭제합니다.' });
    const success = await clearAllData();
    if(success) {
        toast({ title: '초기화 완료', description: '모든 데이터가 삭제되었습니다. 페이지를 새로고침합니다.' });
        setTimeout(() => window.location.reload(), 2000);
    }
    setIsProcessing(false);
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>데이터 백업 및 복원</CardTitle>
          <CardDescription>
            모든 건물, 임차인 및 납부 데이터를 JSON 파일로 백업하거나 복원합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button onClick={handleBackup} disabled={isProcessing} className="w-full sm:w-auto">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              데이터 백업
            </Button>
            <div className="flex w-full max-w-sm items-center space-x-2">
              <Input
                type="file"
                accept=".json"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                disabled={isProcessing}
              />
               <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={!uploadFile || isProcessing}>
                    데이터 복원
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>정말 복원하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      이 작업은 현재 데이터베이스의 모든 정보를 삭제하고 백업 파일의 정보로 대체합니다. 이 작업은 되돌릴 수 없습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRestore} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      복원
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle>데이터 초기화</CardTitle>
          <CardDescription className="text-destructive">
            위험 구역: 이 작업은 모든 데이터를 영구적으로 삭제합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isProcessing}>
                모든 데이터 초기화
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>정말 모든 데이터를 초기화하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  이 작업은 되돌릴 수 없습니다. 모든 건물, 임차인, 납부 기록이 영구적으로 삭제됩니다. 계속 진행하려면 '초기화'를 클릭하세요.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} className="bg-destructive hover:bg-destructive/90" disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  초기화
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
