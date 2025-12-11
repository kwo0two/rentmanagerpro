'use client';

import { LeaseAgreement, Payment, BuildingUnit } from '@/lib/types';
import { collection, query, where, orderBy, getDocs, doc, Timestamp, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Wallet, Pencil, Loader2, CalendarIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Skeleton } from '../ui/skeleton';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import React, { useEffect, useState, useMemo } from 'react';
import { useFirebase, errorEmitter, FirestorePermissionError, useMemoFirebase } from '@/firebase';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format as formatDateFns } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

type PaymentWithLease = Payment & { 
  lease: LeaseAgreement & { unitNames?: string[] }
};

const paymentFormSchema = z.object({
  paymentDate: z.date({ required_error: "납부일을 선택해주세요." }),
  paymentAmount: z.preprocess(
    (val) => (typeof val === 'string' ? val.replace(/,/g, '') : val),
    z.coerce.number().min(1, { message: '납부액을 1원 이상 입력해주세요.' })
  ),
});

function EditPaymentDialog({ payment, onSave, onDelete }: { payment: Payment, onSave: () => void, onDelete: (paymentId: string) => void }) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof paymentFormSchema>>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      paymentDate: payment.paymentDate instanceof Timestamp ? payment.paymentDate.toDate() : payment.paymentDate,
      paymentAmount: payment.paymentAmount,
    }
  });

  const onSubmit = async (data: z.infer<typeof paymentFormSchema>) => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    const paymentRef = doc(firestore, 'payments', payment.id);

    try {
      await updateDocumentNonBlocking(paymentRef, data, {
        userId: user.uid,
        userEmail: user.email || 'N/A',
        action: 'update_payment',
        details: { paymentId: payment.id, newAmount: data.paymentAmount, newDate: formatDate(data.paymentDate) }
      });

      toast({ title: "수정 완료", description: "납부 기록이 성공적으로 수정되었습니다."});
      onSave();
      setIsOpen(false);
    } catch(error) {
      console.error("Error updating payment:", error);
      toast({ variant: 'destructive', title: "수정 실패", description: "납부 기록 수정 중 오류가 발생했습니다."});
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleDeleteClick = () => {
    if (!firestore || !user) return;
    const paymentRef = doc(firestore, 'payments', payment.id);
    
    deleteDocumentNonBlocking(paymentRef, {
      userId: user.uid,
      userEmail: user.email || 'N/A',
      action: 'delete_payment',
      details: { paymentId: payment.id },
    });

    toast({
      title: '납부 기록 삭제됨',
      description: '선택한 납부 기록이 삭제되었습니다.',
    });
    onDelete(payment.id);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="relative cursor-pointer hover:bg-muted/50 transition-colors p-4 border-b">
            <div className='flex justify-between items-center'>
              <p className='text-sm text-muted-foreground'>{formatDate(payment.paymentDate)}</p>
              <p className='font-semibold'>{formatCurrency(payment.paymentAmount)}</p>
            </div>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>납부 기록 수정</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
           <Controller
            control={form.control}
            name="paymentDate"
            render={({ field }) => (
                <div className="space-y-2">
                    <Label>납부일</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? formatDateFns(field.value, "yyyy년 M월 d일", { locale: ko }) : <span>날짜 선택</span>}
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          captionLayout='dropdown-buttons'
                          fromYear={2010}
                          toYear={new Date().getFullYear() + 1}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {form.formState.errors.paymentDate && <p className="text-sm font-medium text-destructive">{form.formState.errors.paymentDate.message}</p>}
                </div>
            )}
            />
           <div className="space-y-2">
              <Label htmlFor="paymentAmount">납부액</Label>
              <Controller
                name="paymentAmount"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="paymentAmount"
                    type="text"
                    value={new Intl.NumberFormat('ko-KR').format(field.value || 0)}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/,/g, '');
                      if (/^\d*$/.test(rawValue)) {
                        field.onChange(Number(rawValue));
                      }
                    }}
                  />
                )}
              />
              {form.formState.errors.paymentAmount && <p className="text-sm font-medium text-destructive">{form.formState.errors.paymentAmount.message}</p>}
            </div>

          <DialogFooter className="sm:justify-end pt-4">
            <Button type="button" variant="destructive" onClick={handleDeleteClick} disabled={isSubmitting}>삭제</Button>
            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


export function PaymentsList({ buildingId }: { buildingId: string }) {
  const { firestore, user } = useFirebase();
  const [paymentsByTenant, setPaymentsByTenant] = useState<Map<string, PaymentWithLease[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const buildingRef = useMemoFirebase(() => {
    if (!firestore || !buildingId) return null;
    return doc(firestore, 'buildings', buildingId);
  }, [firestore, buildingId]);

  const [building, setBuilding] = useState<any>(null);

  useEffect(() => {
    if (!buildingRef) return;
    const unsub = onSnapshot(buildingRef, (doc) => {
        setBuilding({ id: doc.id, ...doc.data() });
    });
    return () => unsub();
  }, [buildingRef]);


  useEffect(() => {
    async function fetchData() {
        if (!firestore || !user || !buildingId || !building) return;
        setIsLoading(true);
        setError(null);

        try {
            const leasesQuery = query(collection(firestore, 'leaseAgreements'), where('ownerId', '==', user.uid), where('buildingId', '==', buildingId));
            const leasesSnapshot = await getDocs(leasesQuery);
            const leases = leasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as LeaseAgreement);
            
            const leaseIds = leases.map(l => l.id);
            if (leaseIds.length === 0) {
              setPaymentsByTenant(new Map());
              setIsLoading(false);
              return;
            }

            const paymentsQuery = query(collection(firestore, 'payments'), where('ownerId', '==', user.uid), where('leaseAgreementId', 'in', leaseIds));
            const paymentsSnapshot = await getDocs(paymentsQuery);
            const allPayments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Payment);
            
            // Sort payments by date in descending order on the client-side
            allPayments.sort((a, b) => {
                const dateA = a.paymentDate instanceof Timestamp ? a.paymentDate.toMillis() : new Date(a.paymentDate).getTime();
                const dateB = b.paymentDate instanceof Timestamp ? b.paymentDate.toMillis() : new Date(b.paymentDate).getTime();
                return dateB - dateA;
            });

            const leasesMap = new Map(leases.map(l => {
              const unitNames = l.unitIds.map(uid => building.units?.find((u: BuildingUnit) => u.id === uid)?.name || uid);
              return [l.id, {...l, unitNames}];
            }));

            const groupedPayments = new Map<string, PaymentWithLease[]>();

            allPayments.forEach(p => {
              const lease = leasesMap.get(p.leaseAgreementId);
              if (lease) {
                const tenantKey = `${lease.tenantName}-${lease.unitNames.join(',')}`;
                if (!groupedPayments.has(tenantKey)) {
                  groupedPayments.set(tenantKey, []);
                }
                groupedPayments.get(tenantKey)!.push({ ...p, lease });
              }
            });

            setPaymentsByTenant(groupedPayments);
        } catch (err: any) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }
    fetchData();
  }, [firestore, user, buildingId, building, refreshKey]);

  const handleSave = () => {
    setRefreshKey(oldKey => oldKey + 1);
  };
  
  const handleDelete = (paymentId: string) => {
    setPaymentsByTenant(prevMap => {
        const newMap = new Map(prevMap);
        for(const [key, payments] of newMap.entries()){
            const filteredPayments = payments.filter(p => p.id !== paymentId);
            if(filteredPayments.length === 0){
                newMap.delete(key);
            } else {
                newMap.set(key, filteredPayments);
            }
        }
        return newMap;
    });
  }


  if (isLoading) {
    return (
        <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
            ))}
        </div>
    );
  }

  if (error) {
    return (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>오류 발생</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">
                납부 기록을 불러오는 중 오류가 발생했습니다: {error.message}
            </AlertDescription>
        </Alert>
    );
  }

  if (paymentsByTenant.size === 0) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed shadow-sm p-8 text-center h-[400px]">
            <Wallet className="w-16 h-16 text-muted-foreground" />
            <h2 className="mt-6 text-xl font-semibold">납부 기록이 없습니다.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
                이 건물에는 아직 등록된 납부 기록이 없습니다.
            </p>
        </div>
    );
  }

  return (
    <Accordion type="multiple" className="w-full">
      {Array.from(paymentsByTenant.entries()).map(([key, payments], index) => {
        const tenantInfo = payments[0].lease;
        const totalAmount = payments.reduce((sum, p) => sum + p.paymentAmount, 0);

        return (
          <AccordionItem value={`item-${index}`} key={key}>
            <AccordionTrigger>
              <div className='flex justify-between items-center w-full pr-4'>
                <div className='text-left'>
                    <p className='font-semibold'>{tenantInfo.tenantName} ({tenantInfo.unitNames?.join(', ')})</p>
                    <p className='text-sm text-muted-foreground'>총 납부액: {formatCurrency(totalAmount)} / {payments.length}건</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
                {payments.map(p => (
                   <EditPaymentDialog key={p.id} payment={p} onSave={handleSave} onDelete={handleDelete} />
                ))}
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  );
}
