'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { addMonths, format as formatDateFns, startOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase } from '@/firebase';
import { LeaseAgreement, Building } from '@/lib/types';
import { collection, query, where, doc, getDocs, writeBatch } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import React, { useMemo, useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { Calendar } from '../ui/calendar';
import { cn, getLeaseDetails } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Separator } from '../ui/separator';

const formSchema = z.object({
  leaseAgreementId: z.string().min(1, { message: '임차인을 선택해주세요.' }),
  paymentAmount: z.preprocess(
    (val) => (typeof val === 'string' ? val.replace(/,/g, '') : val),
    z.coerce.number().min(1, { message: '납부액을 1원 이상 입력해주세요.' })
  ),
  // Single payment
  singlePaymentDate: z.date().optional(),
  // Bulk payment
  bulkMode: z.enum(['single', 'bulk']).default('single'),
  bulkType: z.enum(['monthly', 'manual']).default('monthly'),
  bulkStartDate: z.date().optional(),
  bulkEndDate: z.date().optional(),
  bulkMonthlyDay: z.coerce.number().min(1).max(31).default(1),
  bulkManualDates: z.array(z.date()).optional(),
}).refine(data => {
    if (data.bulkMode === 'single') {
        return !!data.singlePaymentDate;
    }
    if (data.bulkMode === 'bulk') {
        if (!data.bulkStartDate || !data.bulkEndDate) return false;
        if (data.bulkType === 'monthly') return !!data.bulkMonthlyDay;
        if (data.bulkType === 'manual') return data.bulkManualDates && data.bulkManualDates.length > 0;
    }
    return true;
}, {
    message: '필요한 모든 필드를 입력해주세요.',
    path: ['bulkMode'], // You can refine the path to be more specific if needed
});

type LeaseWithUnitNames = LeaseAgreement & { displayUnitNames: string };

export function NewPaymentForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { firestore, user } = useFirebase();

  const [leases, setLeases] = useState<LeaseWithUnitNames[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLease, setSelectedLease] = useState<LeaseAgreement | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      paymentAmount: 0,
      singlePaymentDate: new Date(),
      bulkMode: 'single',
      bulkType: 'monthly',
      bulkMonthlyDay: 1,
      bulkManualDates: [],
    },
  });

  const selectedLeaseId = form.watch('leaseAgreementId');
  const bulkMode = form.watch('bulkMode');
  const bulkType = form.watch('bulkType');

  useEffect(() => {
    async function fetchInitialData() {
        if (!firestore || !user) return;
        setIsLoading(true);
        try {
            const leasesQuery = query(collection(firestore, 'leaseAgreements'), where('ownerId', '==', user.uid));
            const buildingsQuery = query(collection(firestore, 'buildings'), where('ownerId', '==', user.uid));

            const [leasesSnapshot, buildingsSnapshot] = await Promise.all([
                getDocs(leasesQuery),
                getDocs(buildingsQuery),
            ]);
            
            const leasesData = leasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaseAgreement));
            const buildingsData = buildingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Building));
            setBuildings(buildingsData);

            const buildingsMap = new Map(buildingsData.map(b => [b.id, b]));

            const leasesWithUnitNames = leasesData.map(lease => {
              const building = buildingsMap.get(lease.buildingId);
              const unitNames = (lease.unitIds || []).map(unitId => 
                building?.units?.find(u => u.id === unitId)?.name || unitId
              ).join(', ');
              return { ...lease, displayUnitNames: unitNames };
            });

            setLeases(leasesWithUnitNames);

        } catch (error) {
            console.error("Error fetching leases:", error);
            toast({ variant: 'destructive', title: '초기 데이터 로딩 실패' });
        } finally {
            setIsLoading(false);
        }
    }
    fetchInitialData();
  }, [firestore, user, toast]);

  useEffect(() => {
    const lease = leases.find(l => l.id === selectedLeaseId);
    if (lease) {
      setSelectedLease(lease);
      const { rentAmount } = getLeaseDetails(lease);
      
      let amountToSet = rentAmount;
      if (lease.vatTreatment === 'excluded') {
        amountToSet = Math.round(rentAmount * 1.1);
      }
      
      form.setValue('paymentAmount', amountToSet);
    } else {
      setSelectedLease(null);
    }
  }, [selectedLeaseId, leases, form]);

  const generatedPaymentsPreview = useMemo(() => {
    if (bulkMode !== 'bulk') return [];
    
    const { bulkStartDate, bulkEndDate, bulkType, bulkMonthlyDay, bulkManualDates } = form.getValues();

    if (!bulkStartDate || !bulkEndDate) return [];

    if (bulkType === 'monthly') {
        const dates = [];
        let current = new Date(bulkStartDate);
        const end = new Date(bulkEndDate);

        while (current <= end) {
            dates.push(new Date(current.getFullYear(), current.getMonth(), bulkMonthlyDay));
            current = addMonths(current, 1);
        }
        return dates;
    }

    if (bulkType === 'manual') {
        return bulkManualDates || [];
    }

    return [];
  }, [bulkMode, form.watch('bulkStartDate'), form.watch('bulkEndDate'), form.watch('bulkType'), form.watch('bulkMonthlyDay'), form.watch('bulkManualDates')]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user) {
      toast({ variant: 'destructive', title: '오류', description: '로그인이 필요합니다.' });
      return;
    }
    setIsSubmitting(true);

    const paymentDates = bulkMode === 'single' ? (values.singlePaymentDate ? [values.singlePaymentDate] : []) : generatedPaymentsPreview;
    
    if (paymentDates.length === 0) {
        toast({ variant: 'destructive', title: '오류', description: '생성할 납부 기록이 없습니다. 날짜를 확인해주세요.' });
        setIsSubmitting(false);
        return;
    }

    try {
        const batch = writeBatch(firestore);
        
        paymentDates.forEach(paymentDate => {
            const paymentId = uuidv4();
            const paymentRef = doc(firestore, 'payments', paymentId);
            batch.set(paymentRef, {
                id: paymentId,
                ownerId: user.uid,
                leaseAgreementId: values.leaseAgreementId,
                paymentDate: startOfDay(paymentDate),
                paymentAmount: values.paymentAmount,
            });
        });

        await batch.commit();

      toast({
        title: '납부 기록 추가됨',
        description: `${paymentDates.length}개의 납부 기록이 성공적으로 추가되었습니다.`,
      });
      router.push('/payments');
    } catch (error) {
      console.error("Error adding payment records: ", error);
      toast({
        variant: 'destructive',
        title: '오류',
        description: `납부 기록을 추가하는 중 오류가 발생했습니다: ${(error as Error).message}`,
      });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>신규 납부 기록</CardTitle>
        <CardDescription>임차인의 임대료 납부 내역을 기록합니다. 단일 또는 일괄 추가가 가능합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="leaseAgreementId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>임차인 선택</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoading ? "임차인 목록 로딩중..." : "납부 기록을 추가할 임차인을 선택하세요"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leases?.map((lease) => (
                        <SelectItem key={lease.id} value={lease.id}>
                          {lease.tenantName} ({lease.buildingName} {lease.displayUnitNames})
                        </SelectItem>
                      ))}
                      {!isLoading && (!leases || leases.length === 0) && (
                        <div className="p-4 text-sm text-muted-foreground">
                          등록된 임차인이 없습니다. 먼저 임차인을 추가해주세요.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="paymentAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>납부액 (건별)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="1,000,000"
                      value={new Intl.NumberFormat('ko-KR').format(field.value || 0)}
                      onChange={(e) => {
                        const rawValue = e.target.value.replace(/,/g, '');
                        if (/^\d*$/.test(rawValue)) {
                           field.onChange(Number(rawValue));
                        }
                      }}
                      disabled={!selectedLeaseId}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bulkMode"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>입력 방식</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="single" />
                        </FormControl>
                        <FormLabel className="font-normal">단일 추가</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="bulk" />
                        </FormControl>
                        <FormLabel className="font-normal">일괄 추가</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />

            {bulkMode === 'single' && (
              <FormField
                control={form.control}
                name="singlePaymentDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>납부일</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={!selectedLeaseId}
                          >
                            {field.value ? (
                              formatDateFns(field.value, "yyyy년 M월 d일", { locale: ko })
                            ) : (
                              <span>날짜 선택</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {bulkMode === 'bulk' && (
                <Card className="bg-muted/50 p-6">
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="bulkStartDate"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>시작월</FormLabel>
                                    <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn("w-full bg-background pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                            disabled={!selectedLeaseId}
                                        >
                                            {field.value ? formatDateFns(field.value, "yyyy년 M월") : <span>날짜 선택</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                                    </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="bulkEndDate"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>종료월</FormLabel>
                                    <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn("w-full bg-background pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                            disabled={!selectedLeaseId}
                                        >
                                            {field.value ? formatDateFns(field.value, "yyyy년 M월") : <span>날짜 선택</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                                    </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                        
                        <FormField
                            control={form.control}
                            name="bulkType"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>납부일 지정 방식</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4">
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                        <FormControl><RadioGroupItem value="monthly" /></FormControl>
                                        <FormLabel className="font-normal">매월 같은 날짜</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                        <FormControl><RadioGroupItem value="manual" /></FormControl>
                                        <FormLabel className="font-normal">날짜 직접 선택</FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                </FormItem>
                            )}
                        />

                        {bulkType === 'monthly' && (
                             <FormField
                                control={form.control}
                                name="bulkMonthlyDay"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>매월 납부일</FormLabel>
                                    <div className="relative w-24">
                                       <Input type="number" min={1} max={31} {...field} />
                                       <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">일</span>
                                    </div>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {bulkType === 'manual' && (
                            <FormField
                                control={form.control}
                                name="bulkManualDates"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>납부일 선택</FormLabel>
                                        <FormControl>
                                            <Calendar
                                                mode="multiple"
                                                min={1}
                                                selected={field.value}
                                                onSelect={field.onChange}
                                                className="rounded-md border bg-background"
                                                disabled={!form.getValues('bulkStartDate') || !form.getValues('bulkEndDate')}
                                                month={form.getValues('bulkStartDate')}
                                            />
                                        </FormControl>
                                        <FormDescription>달력에서 납부한 날짜들을 모두 선택하세요.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        <Separator />
                        <div className="text-sm font-medium">
                            {generatedPaymentsPreview.length > 0 ? (
                                <p>총 <span className="text-primary font-bold">{generatedPaymentsPreview.length}개</span>의 납부 기록이 생성됩니다.</p>
                            ) : (
                                <p className="text-muted-foreground">생성될 납부 기록이 없습니다. 기간과 날짜를 확인해주세요.</p>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            <Button type="submit" disabled={isSubmitting || !selectedLeaseId}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bulkMode === 'bulk' ? '일괄 기록 추가' : '납부 기록 추가'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
