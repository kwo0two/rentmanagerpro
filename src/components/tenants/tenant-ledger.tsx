'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import {
  doc,
  collection,
  query,
  orderBy,
  Timestamp,
  where,
  getDocs,
  getDoc,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import { LeaseAgreement, Payment, Building, RentAdjustment } from '@/lib/types';
import * as XLSX from 'xlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Info, Pencil, FileDown, Printer, Loader2 } from 'lucide-react';
import {
  format as formatDateFns,
  addMonths,
  addDays,
  getDaysInMonth,
  isBefore,
  isAfter,
  startOfDay,
  endOfMonth,
  startOfMonth,
  differenceInCalendarDays,
  isSameDay,
  min,
  max,
} from 'date-fns';
import { formatCurrency, formatDate, cn, getLeaseDetails } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../ui/card';
import { Button } from '../ui/button';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { updateDocumentNonBlocking, deleteDocumentNonBlocking, deleteRentAdjustment, updateRentAdjustment } from '@/firebase/non-blocking-updates';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';


interface LedgerRow {
  date: Date;
  description: string;
  supplyValue: number | null;
  vat: number | null;
  rent: number | null; // supplyValue + vat
  payment: number | null;
  balance: number;
  notes?: string;
  isAdjustment?: boolean;
  isDue: boolean;
  adjustmentId?: string;
}

interface DueEvent {
  date: Date;
  amount: number;
  description: string;
  notes?: string;
  isAdjustment?: boolean;
  isDue: boolean;
  adjustmentId?: string;
}

const adjustmentFormSchema = z.object({
  adjustedRentAmount: z.preprocess(
    (val) => (typeof val === 'string' ? String(val).replace(/,/g, '') : val),
    z.coerce.number().min(0, { message: '조정 임대료를 입력해주세요.' })
  ),
  notes: z.string().min(1, { message: "조정 사유를 입력해주세요."}),
});

// --- Calculation Logic ---

// Helper function to safely convert Timestamp or Date to a Date object.
const getDate = (d: Date | Timestamp): Date => d instanceof Timestamp ? d.toDate() : d;

function getApplicableRent(lease: LeaseAgreement, date: Date): { rent: number, isRenewal: boolean } {
    if (!lease.renewals || lease.renewals.length === 0) {
        return { rent: lease.rentAmount, isRenewal: false };
    }

    const sortedRenewals = [...lease.renewals]
        .sort((a, b) => getDate(a.renewalDate).getTime() - getDate(b.renewalDate).getTime())
        .reverse();

    for (const renewal of sortedRenewals) {
        if (!isBefore(date, getDate(renewal.renewalDate))) {
            return { rent: renewal.newRentAmount, isRenewal: true };
        }
    }

    return { rent: lease.rentAmount, isRenewal: false };
}

function calculateDues(lease: LeaseAgreement, adjustments: RentAdjustment[]): DueEvent[] {
    const dues: DueEvent[] = [];
    const startDate = startOfDay(getDate(lease.leaseStartDate));
    
    const { leaseEndDate: effectiveLeaseEndDate } = getLeaseDetails(lease);

    const today = startOfDay(new Date());

    if (isBefore(effectiveLeaseEndDate, startDate)) return [];

    let currentMonthStart = startOfMonth(startDate);
    const finalBillableDate = min([effectiveLeaseEndDate, today]);

    while (isBefore(currentMonthStart, finalBillableDate) || isSameDay(currentMonthStart, finalBillableDate)) {
        const { rent: baseRentForMonth } = getApplicableRent(lease, currentMonthStart);
        let notes: string | undefined;
        let finalRentForMonth = baseRentForMonth;
        let isProrated = false;

        const adjustmentForMonth = adjustments.find(adj => 
            isSameDay(startOfMonth(getDate(adj.adjustmentDate)), currentMonthStart)
        );

        if (adjustmentForMonth) {
            finalRentForMonth = adjustmentForMonth.adjustedRentAmount;
            notes = `조정: ${adjustmentForMonth.notes}`;
            dues.push({
                date: endOfMonth(currentMonthStart),
                amount: Math.round(finalRentForMonth),
                description: `${formatDateFns(currentMonthStart, 'yyyy-MM')}월분`,
                notes,
                isAdjustment: true,
                isDue: true,
                adjustmentId: adjustmentForMonth.id,
            });

        } else {
             const periodStart = max([currentMonthStart, startDate]);
             const periodEnd = min([endOfMonth(currentMonthStart), finalBillableDate]);
             const daysInMonth = getDaysInMonth(currentMonthStart);
             let billableDays = differenceInCalendarDays(periodEnd, periodStart) + 1;

             if (isBefore(periodEnd, periodStart)) {
                billableDays = 0;
             }
            
            const rentFreeEndDate = lease.rentFreePeriod && lease.rentFreePeriod > 0
                ? lease.rentFreeUnit === 'months'
                    ? addDays(addMonths(startDate, lease.rentFreePeriod), -1)
                    : addDays(startDate, lease.rentFreePeriod - 1)
                : null;
            
            if (rentFreeEndDate && isAfter(rentFreeEndDate, currentMonthStart)) {
                const freePeriodStartInThisMonth = max([periodStart, startDate]);
                const freePeriodEndInThisMonth = min([periodEnd, rentFreeEndDate]);

                if (isAfter(freePeriodEndInThisMonth, freePeriodStartInThisMonth) || isSameDay(freePeriodEndInThisMonth, freePeriodStartInThisMonth)) {
                    const freeDays = differenceInCalendarDays(freePeriodEndInThisMonth, freePeriodStartInThisMonth) + 1;
                    billableDays = Math.max(0, billableDays - freeDays);
                }
            }

            if (billableDays <= 0) {
                finalRentForMonth = 0;
                notes = '렌트프리';
            } else if (billableDays < daysInMonth) {
                isProrated = true;
                finalRentForMonth = (baseRentForMonth / daysInMonth) * billableDays;
            } else {
                 const isFirstMonthProrated = lease.rentCalculationMethod === 'end_of_month' && isSameDay(currentMonthStart, startOfMonth(startDate)) && startDate.getDate() !== 1;
                 const isLastMonthProrated = lease.rentCalculationMethod === 'end_of_month' && isSameDay(currentMonthStart, startOfMonth(effectiveLeaseEndDate)) && !isSameDay(effectiveLeaseEndDate, endOfMonth(effectiveLeaseEndDate));

                 if(isFirstMonthProrated || isLastMonthProrated) {
                    isProrated = true;
                    finalRentForMonth = (baseRentForMonth / daysInMonth) * billableDays;
                 }
            }
             if (isProrated && !notes) {
                notes = `일할계산 (${Math.round(billableDays)}일)`;
            }

            if (isAfter(currentMonthStart, effectiveLeaseEndDate) || isAfter(currentMonthStart, today)) {
                break;
            }
            dues.push({
                date: endOfMonth(currentMonthStart),
                amount: Math.round(finalRentForMonth),
                description: `${formatDateFns(currentMonthStart, 'yyyy-MM')}월분`,
                notes,
                isDue: true,
            });
        }
        
        currentMonthStart = addMonths(currentMonthStart, 1);
    }
    
    return dues;
}

function RentAdjustmentDialog({
  triggerButton,
  lease,
  ledgerRow,
  onSave
}: {
  triggerButton: React.ReactNode,
  lease: LeaseAgreement,
  ledgerRow: LedgerRow,
  onSave: () => void,
}) {
  const { firestore, user } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const defaultValues = useMemo(() => {
    return {
      adjustedRentAmount: ledgerRow.isAdjustment ? (ledgerRow.rent ?? 0) : (ledgerRow.rent ?? lease.rentAmount),
      notes: ledgerRow.isAdjustment ? (ledgerRow.notes || '').replace('조정: ','') : ''
    }
  }, [ledgerRow, lease]);

  const form = useForm<z.infer<typeof adjustmentFormSchema>>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [form, defaultValues, isOpen]);


  const onSubmit = async (data: z.infer<typeof adjustmentFormSchema>) => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    const adjustmentId = ledgerRow.adjustmentId || uuidv4();
    const adjustmentDate = startOfMonth(ledgerRow.date);

    try {
      await updateRentAdjustment(firestore,
        adjustmentId,
        {
          id: adjustmentId,
          ownerId: user.uid,
          leaseAgreementId: lease.id,
          adjustmentDate: Timestamp.fromDate(adjustmentDate),
          adjustedRentAmount: data.adjustedRentAmount,
          notes: data.notes
        }
      );
      toast({ title: "임대료 조정 완료", description: `${formatDateFns(adjustmentDate, 'yyyy년 MM월')} 임대료가 수정되었습니다.`});
      onSave();
      setIsOpen(false);
    } catch(error) {
      console.error(error);
      toast({ variant: 'destructive', title: "오류", description: "임대료 조정 중 오류가 발생했습니다."});
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!firestore || !user || !ledgerRow.adjustmentId) return;
    setIsSubmitting(true);

    const adjustmentDate = startOfMonth(ledgerRow.date);

    try {
        await deleteRentAdjustment(firestore, ledgerRow.adjustmentId);
        toast({ title: "조정 삭제 완료", description: `${formatDateFns(adjustmentDate, 'yyyy년 MM월')} 임대료 조정 내역이 삭제되었습니다.`});
        onSave();
        setIsOpen(false);
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: "삭제 실패", description: "조정 내역 삭제 중 오류가 발생했습니다."});
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{formatDateFns(ledgerRow.date, 'yyyy년 MM월')} 임대료 조정</DialogTitle>
          <DialogDescription>해당 월의 임대료를 수정하고 사유를 입력하세요. 계약서의 기본 임대료는 변경되지 않습니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="adjustedRentAmount">조정 임대료 (원)</Label>
              <Controller
                name="adjustedRentAmount"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="adjustedRentAmount"
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
              {form.formState.errors.adjustedRentAmount && <p className="text-sm font-medium text-destructive">{form.formState.errors.adjustedRentAmount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">조정 사유</Label>
              <Textarea id="notes" {...form.register("notes")} />
              {form.formState.errors.notes && <p className="text-sm font-medium text-destructive">{form.formState.errors.notes.message}</p>}
            </div>
            <DialogFooter className="sm:justify-between">
              {ledgerRow.adjustmentId ? (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" disabled={isSubmitting}>
                            조정 삭제
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
                            <AlertDialogDescription>
                                이 월의 임대료 조정 내역을 삭제하고 원래 계약 금액으로 되돌립니다. 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '삭제'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              ) : <div></div>}
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


export function TenantLedger({ tenantId }: { tenantId: string }) {
  const { firestore, user } = useFirebase();
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [lease, setLease] = useState<LeaseAgreement | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggerFetch, setTriggerFetch] = useState(0);

  const unitNames = useMemo(() => {
    if (!lease || !building) return [];
    return (lease.unitIds || []).map(unitId => {
      return building.units?.find(u => u.id === unitId)?.name || unitId;
    });
  }, [lease, building]);


  useEffect(() => {
    async function fetchData() {
        if (!firestore || !user || !tenantId) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const leaseDocRef = doc(firestore, 'leaseAgreements', tenantId);
            const leaseSnapshot = await getDoc(leaseDocRef);
            
            if (!leaseSnapshot.exists()) {
                throw new Error("임대 계약 정보를 찾을 수 없습니다.");
            }
            
            if(leaseSnapshot.data()?.ownerId !== user.uid) {
                const permissionError = new FirestorePermissionError({
                    path: leaseDocRef.path,
                    operation: 'get',
                });
                errorEmitter.emit('permission-error', permissionError);
                throw permissionError;
            }

            const fetchedLease = { id: leaseSnapshot.id, ...leaseSnapshot.data() } as LeaseAgreement;
            setLease(fetchedLease);

            const buildingDocRef = doc(firestore, 'buildings', fetchedLease.buildingId);
            const buildingSnapshot = await getDoc(buildingDocRef);
            
            if (buildingSnapshot.exists() && buildingSnapshot.data()?.ownerId !== user.uid) {
                 const permissionError = new FirestorePermissionError({
                    path: buildingDocRef.path,
                    operation: 'get',
                });
                errorEmitter.emit('permission-error', permissionError);
                throw permissionError;
            }

            const fetchedBuilding = buildingSnapshot.exists() ? { id: buildingSnapshot.id, ...buildingSnapshot.data() } as Building : null;
            setBuilding(fetchedBuilding);

            const paymentsQuery = query(collection(firestore, 'payments'), where('leaseAgreementId', '==', tenantId));
            const adjustmentsQuery = query(collection(firestore, 'rentAdjustments'), where('leaseAgreementId', '==', tenantId));
            
            const [paymentsSnapshot, adjustmentsSnapshot] = await Promise.all([
                getDocs(paymentsQuery).catch(e => {
                    const error = new FirestorePermissionError({ path: `payments where leaseAgreementId == ${tenantId}`, operation: 'list' });
                    errorEmitter.emit('permission-error', error);
                    throw error;
                }),
                getDocs(adjustmentsQuery).catch(e => {
                    const error = new FirestorePermissionError({ path: `rentAdjustments where leaseAgreementId == ${tenantId}`, operation: 'list' });
                    errorEmitter.emit('permission-error', error);
                    throw error;
                })
            ]);
            
            const fetchedPayments = paymentsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }) as Payment)
                .sort((a,b) => getDate(a.paymentDate).getTime() - getDate(b.paymentDate).getTime());
            
            const fetchedAdjustments = adjustmentsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }) as RentAdjustment);

            const dues = calculateDues(fetchedLease, fetchedAdjustments);
            
            const paymentEvents = fetchedPayments.map((p) => ({
                date: startOfDay(getDate(p.paymentDate)),
                rent: null,
                payment: p.paymentAmount,
                description: '입금',
                notes: undefined,
                isAdjustment: false,
                isDue: false,
            }));

            const dueEvents = dues.map((due) => ({
                date: due.date,
                rent: due.amount,
                payment: null,
                description: due.description,
                notes: due.notes,
                isAdjustment: due.isAdjustment,
                isDue: true,
                adjustmentId: due.adjustmentId,
            }));

            const allEvents = [...dueEvents, ...paymentEvents];

            allEvents.sort((a, b) => {
                if (!isSameDay(a.date, b.date)) {
                return a.date.getTime() - b.date.getTime();
                }
                if (a.rent !== null && b.payment !== null) return -1;
                if (a.payment !== null && b.rent !== null) return 1;
                return 0;
            });

            const newLedger: LedgerRow[] = [];
            let runningBalance = 0;

            for (const event of allEvents) {
                let supplyValue: number | null = null;
                let vat: number | null = null;
                let totalRentForEvent = event.rent;

                if (event.rent !== null) {
                    const rentAmount = event.rent;
                    if (fetchedLease.vatTreatment === 'included' && rentAmount > 0) {
                        supplyValue = Math.round(rentAmount / 1.1);
                        vat = rentAmount - supplyValue;
                    } else if (fetchedLease.vatTreatment === 'excluded' && rentAmount > 0) {
                        supplyValue = rentAmount;
                        vat = Math.round(rentAmount * 0.1);
                    } else {
                        supplyValue = rentAmount;
                        vat = 0;
                    }
                    totalRentForEvent = supplyValue + (vat || 0);
                    runningBalance += totalRentForEvent;
                }

                if (event.payment !== null) {
                    runningBalance -= event.payment;
                }

                newLedger.push({ ...event, date: event.date, supplyValue, vat, rent: totalRentForEvent, balance: runningBalance });
            }
            setLedger(newLedger);

        } catch (e: any) {
            console.error('Failed to build ledger:', e);
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }

    fetchData();
  }, [firestore, user, tenantId, triggerFetch]);


  const handlePrint = () => {
    window.print();
  };

  const getVatText = () => {
    if (!lease) return '';
    switch (lease.vatTreatment) {
      case 'excluded':
        return '(부가세 별도)';
      case 'included':
        return '(부가세 포함)';
      case 'none':
      default:
        return '(부가세 미발행)';
    }
  };

  const handleExportToExcel = () => {
    if (!lease || !ledger) return;

    const { rentAmount, leaseEndDate } = getLeaseDetails(lease);

    // 1. Create Lease Info Header
    const leaseInfoData = [
      ['임대 계약 정보'],
      ['임차인', lease.tenantName],
      ['연락처', lease.tenantContact],
      ['건물 및 호수', `${lease.buildingName} ${unitNames.join(', ')}`],
      ['계약 기간', `${formatDate(lease.leaseStartDate)} ~ ${formatDate(leaseEndDate)}`],
      ['임대 보증금', `${formatCurrency(lease.leaseDepositAmount || 0)}`],
      ['월 임대료', `${formatCurrency(rentAmount)} ${getVatText()}`],
    ];
    if (lease.rentFreePeriod && lease.rentFreePeriod > 0) {
        leaseInfoData.push(['렌트프리', `${lease.rentFreePeriod}${lease.rentFreeUnit === 'months' ? '개월' : '일'}`]);
    }
    leaseInfoData.push([]); // Add a blank row for spacing

    // 2. Create Ledger Table Header
    const ledgerHeader = [
      '일자', '내용', '공급가액', '부가세', '합계 (차변)', '납부액 (대변)', '잔액', '비고'
    ];

    // 3. Format Ledger Data
    const ledgerData = ledger.map(row => ({
      '일자': formatDate(row.date),
      '내용': row.description,
      '공급가액': row.supplyValue !== null ? row.supplyValue : '',
      '부가세': row.vat !== null ? row.vat : '',
      '합계 (차변)': row.rent !== null ? row.rent : '',
      '납부액 (대변)': row.payment !== null ? row.payment : '',
      '잔액': row.balance,
      '비고': row.notes || '',
    }));

    // 4. Create worksheet and workbook
    const ws = XLSX.utils.json_to_sheet([], { header: ledgerHeader, skipHeader: true });
    
    XLSX.utils.sheet_add_aoa(ws, leaseInfoData, { origin: 'A1' });
    XLSX.utils.sheet_add_json(ws, ledgerData, { origin: `A${leaseInfoData.length + 1}`, skipHeader: false });
    
    ws['!cols'] = [
        { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, 
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "임차인원장");

    // 5. Trigger download
    XLSX.writeFile(wb, `${lease.tenantName}_임차인원장_${formatDateFns(new Date(), 'yyyyMMdd')}.xlsx`);
  };


  if (isLoading) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>오류</AlertTitle>
        <AlertDescription className="whitespace-pre-wrap">
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!lease) {
     return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>데이터 없음</AlertTitle>
        <AlertDescription>
          임대 계약 정보를 불러올 수 없습니다.
        </AlertDescription>
      </Alert>
    );
  }

  const { rentAmount: currentRent, leaseEndDate: effectiveLeaseEndDate } = getLeaseDetails(lease);
  const isLeaseExpired = isBefore(effectiveLeaseEndDate, new Date());

  return (
    <div className="space-y-6" id="tenant-ledger-printable">
      <Card className='print-only-card'>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">임대 계약 정보</CardTitle>
            <CardDescription>임차인의 상세 계약 내용입니다.</CardDescription>
          </div>
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" onClick={handleExportToExcel}>
                <FileDown className="mr-2 h-4 w-4" />
                엑셀로 저장
            </Button>
             <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                인쇄하기
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/tenants/${tenantId}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                계약 수정
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-semibold text-muted-foreground">임차인</p>
            <p>{lease?.tenantName}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">연락처</p>
            <p>{lease?.tenantContact}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">건물 및 호수</p>
            <p>
              {lease?.buildingName} {unitNames.join(', ')}
            </p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">계약 기간</p>
            <p>
              {formatDate(lease?.leaseStartDate)} ~{' '}
              {formatDate(effectiveLeaseEndDate)}
            </p>
          </div>
           <div>
            <p className="font-semibold text-muted-foreground">임대 보증금</p>
            <p>
              {formatCurrency(lease?.leaseDepositAmount || 0)}
            </p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">월 임대료</p>
            <p>
              {formatCurrency(currentRent || 0)}{' '}
              <span className="text-xs text-muted-foreground">
                {getVatText()}
              </span>
            </p>
          </div>
          {lease?.rentFreePeriod && lease.rentFreePeriod > 0 && (
            <div>
              <p className="font-semibold text-muted-foreground">렌트프리</p>
              <p>
                {lease.rentFreePeriod}
                {lease.rentFreeUnit === 'months' ? '개월' : '일'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isLeaseExpired && (
        <Alert variant="info" className="no-print">
          <Info className="h-4 w-4" />
          <AlertTitle>계약 만료</AlertTitle>
          <AlertDescription>
            이 임대 계약은 {formatDate(effectiveLeaseEndDate)}에
            만료되었습니다. 계약을 연장하려면 '계약 수정' 버튼을 클릭하여
            종료일을 업데이트하세요.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%]">일자</TableHead>
              <TableHead className="w-[15%]">내용</TableHead>
              <TableHead className="w-[12%] text-right">공급가액</TableHead>
              <TableHead className="w-[12%] text-right">부가세</TableHead>
              <TableHead className="w-[12%] text-right">합계 (차변)</TableHead>
              <TableHead className="w-[12%] text-right">납부액 (대변)</TableHead>
              <TableHead className="w-[12%] text-right">잔액</TableHead>
              <TableHead className="w-[15%] text-center">비고</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.length > 0 ? (
              ledger.map((row, index) => (
                <TableRow key={index} className={cn(row.isAdjustment && "bg-yellow-50 dark:bg-yellow-900/20")}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell className="text-right">
                    {row.supplyValue !== null
                      ? formatCurrency(row.supplyValue)
                      : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.vat !== null ? formatCurrency(row.vat) : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.rent !== null ? formatCurrency(row.rent) : ''}
                  </TableCell>
                  <TableCell className="text-right text-blue-600">
                    {row.payment !== null ? formatCurrency(row.payment) : ''}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium',
                      row.balance > 0 ? 'text-destructive' : 'text-foreground'
                    )}
                  >
                    {formatCurrency(row.balance)}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    <div className="flex items-center justify-center gap-1">
                      <span className='flex-1'>{row.notes}</span>
                      {row.isDue && (
                        <RentAdjustmentDialog 
                          lease={lease}
                          ledgerRow={row}
                          onSave={() => setTriggerFetch(v => v + 1)}
                          triggerButton={
                            <Button variant="ghost" size="icon" className="h-6 w-6 no-print">
                              <Pencil className="h-3 w-3" />
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  표시할 데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
