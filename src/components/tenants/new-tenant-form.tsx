'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { format as formatDateFns } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useFirebase } from '@/firebase';
import { Building, LeaseAgreement } from '@/lib/types';
import { collection, query, where, serverTimestamp, doc, Timestamp, getDocs, getDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '../ui/checkbox';
import { Separator }from '../ui/separator';
import { addDocumentNonBlocking, updateDocumentNonBlocking, deleteLeaseAgreementWithRelations } from '@/firebase/non-blocking-updates';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';


const renewalSchema = z.object({
  id: z.string(),
  renewalDate: z.date({ required_error: '재계약 날짜를 선택해주세요.'}),
  newRentAmount: z.preprocess(
    (val) => (typeof val === 'string' ? String(val).replace(/,/g, '') : val),
    z.coerce.number().min(0, { message: '새 임대료를 입력해주세요.' })
  ),
  newLeaseEndDate: z.date({ required_error: '새 계약 종료일을 선택해주세요.'}),
});

const formSchema = z.object({
  buildingId: z.string().min(1, { message: '건물을 선택해주세요.' }),
  tenantName: z.string().min(1, { message: '이름을 입력해주세요.' }),
  tenantAddress: z.string().min(1, { message: '주소를 입력해주세요.' }),
  tenantContact: z.string().min(1, { message: '연락처를 입력해주세요.' }),
  unitIds: z.array(z.string()).min(1, { message: '호실을 하나 이상 선택해주세요.'}),
  leaseDepositAmount: z.preprocess(
    (val) => (typeof val === 'string' ? String(val).replace(/,/g, '') : val),
    z.coerce.number().min(0, { message: '보증금을 입력해주세요.' })
  ),
  rentAmount: z.preprocess(
    (val) => (typeof val === 'string' ? String(val).replace(/,/g, '') : val),
    z.coerce.number().min(0, { message: '임대료를 입력해주세요.' })
  ),
  vatTreatment: z.enum(['none', 'included', 'excluded'], {
    required_error: '부가세 처리 방식을 선택해주세요.',
  }),
  leaseStartDate: z.date({ required_error: '계약 시작일을 선택해주세요.'}),
  leaseEndDate: z.date({ required_error: '계약 종료일을 선택해주세요.'}),
  rentFreePeriod: z.coerce.number().min(0).optional().default(0),
  rentFreeUnit: z.enum(['days', 'months']).optional().default('months'),
  paymentMethod: z.string({
    required_error: '결제 방식을 선택해주세요.',
  }),
  rentCalculationMethod: z.enum(['contract_date', 'end_of_month'], {
    required_error: '임대료 계산 방식을 선택해주세요.',
  }),
  renewals: z.array(renewalSchema).optional(),
});

type NewTenantFormProps = {
  leaseId?: string;
};


export function NewTenantForm({ leaseId }: NewTenantFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { firestore, user } = useFirebase();
  const isEditMode = !!leaseId;
  
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      buildingId: '',
      tenantName: '',
      tenantAddress: '',
      tenantContact: '',
      unitIds: [],
      leaseDepositAmount: 0,
      rentAmount: 0,
      vatTreatment: 'none',
      rentFreePeriod: 0,
      rentFreeUnit: 'months',
      rentCalculationMethod: 'contract_date',
      renewals: [],
    },
  });

  const { fields: renewalFields, append: appendRenewal, remove: removeRenewal } = useFieldArray({
    control: form.control,
    name: "renewals",
  });

  const selectedBuildingId = form.watch('buildingId');
  const [selectedBuilding, setSelectedBuilding] = useState<Building | undefined>(undefined);

  useEffect(() => {
    if (buildings && selectedBuildingId) {
      setSelectedBuilding(buildings.find(b => b.id === selectedBuildingId));
    }
  }, [buildings, selectedBuildingId]);


  useEffect(() => {
    async function fetchData() {
        if (!firestore || !user) return;
        setIsLoading(true);
        
        try {
            const buildingsQuery = query(collection(firestore, 'buildings'), where('ownerId', '==', user.uid));
            const buildingsSnapshot = await getDocs(buildingsQuery);
            const buildingsData = buildingsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Building);
            setBuildings(buildingsData);

            if (isEditMode && leaseId) {
                const leaseDocRef = doc(firestore, 'leaseAgreements', leaseId);
                const leaseSnapshot = await getDoc(leaseDocRef);
                if (leaseSnapshot.exists()) {
                    const existingLease = leaseSnapshot.data() as LeaseAgreement;
                    
                    form.reset({
                        ...existingLease,
                        leaseStartDate: (existingLease.leaseStartDate as Timestamp).toDate(),
                        leaseEndDate: (existingLease.leaseEndDate as Timestamp).toDate(),
                        leaseDepositAmount: existingLease.leaseDepositAmount || 0,
                        rentAmount: existingLease.rentAmount,
                        vatTreatment: existingLease.vatTreatment || 'none',
                        unitIds: existingLease.unitIds || [],
                        paymentMethod: existingLease.paymentMethod,
                        rentCalculationMethod: existingLease.rentCalculationMethod || 'contract_date',
                        renewals: (existingLease.renewals || []).map((r: any) => ({
                            ...r,
                            id: uuidv4(), // The ID is only for react-hook-form key, not stored in DB
                            renewalDate: (r.renewalDate as Timestamp).toDate(),
                            newLeaseEndDate: (r.newLeaseEndDate as Timestamp).toDate(),
                        })),
                    });
                }
            } else if (buildingsData.length > 0) {
                form.setValue('buildingId', buildingsData[0].id);
            }
        } catch (error: any) {
            console.error("Error fetching initial data for form:", error);
            toast({ 
              variant: 'destructive', 
              title: '데이터 로딩 실패',
              description: `오류: ${error.message}`
            });
        } finally {
            setIsLoading(false);
        }
    }
    fetchData();
  }, [firestore, user, isEditMode, leaseId, form, toast]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user || !buildings) {
      toast({
        variant: 'destructive',
        title: '오류',
        description: '로그인이 필요하거나 앱 설정을 불러올 수 없습니다.',
      });
      return;
    }
    setIsSubmitting(true);

    const selectedBuildingOnSubmit = buildings.find(b => b.id === values.buildingId);
    if (!selectedBuildingOnSubmit) {
        toast({
            variant: 'destructive',
            title: '오류',
            description: '선택한 건물을 찾을 수 없습니다.',
        });
        setIsSubmitting(false);
        return;
    }

    try {
        const finalData = {
            ...values,
            ownerId: user.uid,
            buildingName: selectedBuildingOnSubmit.name,
            leaseStartDate: Timestamp.fromDate(values.leaseStartDate),
            leaseEndDate: Timestamp.fromDate(values.leaseEndDate),
            updatedAt: serverTimestamp(),
            renewals: (values.renewals || []).map(r => ({ 
                renewalDate: Timestamp.fromDate(r.renewalDate),
                newRentAmount: r.newRentAmount,
                newLeaseEndDate: Timestamp.fromDate(r.newLeaseEndDate)
            }))
        };

        if (isEditMode && leaseId) {
            const leaseAgreementRef = doc(firestore, 'leaseAgreements', leaseId);
            await updateDocumentNonBlocking(leaseAgreementRef, finalData, {
                userId: user.uid,
                userEmail: user.email || 'N/A',
                action: 'update_tenant',
                details: { leaseId, tenantName: values.tenantName },
            });
            toast({
                title: '계약 수정됨',
                description: `${values.tenantName} 님의 계약 정보가 성공적으로 수정되었습니다.`,
            });
            router.push(`/tenants/${leaseId}`);
        } else {
            const newLeaseId = uuidv4();
            const leaseAgreementRef = doc(firestore, 'leaseAgreements', newLeaseId);
            await addDocumentNonBlocking(leaseAgreementRef, {
                ...finalData,
                id: newLeaseId,
                createdAt: serverTimestamp(),
            }, {
                userId: user.uid,
                userEmail: user.email || 'N/A',
                action: 'create_tenant',
                details: { leaseId: newLeaseId, tenantName: values.tenantName },
            });
            toast({
              title: '임차인 추가됨',
              description: `${values.tenantName} 님이 성공적으로 추가되었습니다.`,
            });
            router.push(`/tenants`);
        }
    } catch (error: any) {
        console.error("Error saving lease agreement:", error);
        toast({
            variant: 'destructive',
            title: '저장 실패',
            description: `계약정보를 저장하는 중 오류가 발생했습니다: ${error.message}`
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  const handleDeleteLease = async () => {
    if (!firestore || !user || !leaseId) return;

    setIsSubmitting(true);
    await deleteLeaseAgreementWithRelations(firestore, leaseId, {
      userId: user.uid,
      userEmail: user.email || 'N/A',
      action: 'delete_tenant',
      details: { leaseId, tenantName: form.getValues('tenantName') },
    });
    setIsSubmitting(false);
    router.push('/tenants');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="w-full h-96" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>{isEditMode ? '임차인 계약 수정' : '신규 임차인 추가'}</CardTitle>
                <CardDescription>{isEditMode ? '계약 정보를 수정합니다.' : '임대차 계약서 정보를 입력합니다.'}</CardDescription>
            </div>
            {isEditMode && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={isSubmitting}>
                            계약 삭제
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
                            <AlertDialogDescription>
                                이 작업은 되돌릴 수 없습니다. 이 임대차 계약과 관련된 모든 납부 기록 및 임대료 조정 기록이 영구적으로 삭제됩니다.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteLease} className="bg-destructive hover:bg-destructive/90">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                삭제
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          <FormField
              control={form.control}
              name="buildingId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>건물 선택</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('unitIds', []);
                    }} 
                    value={field.value} 
                    disabled={isLoading}
                  >
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder={isLoading ? "건물 목록 로딩중..." : "임차인을 추가할 건물을 선택하세요"} />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {buildings?.map((building) => (
                        <SelectItem key={building.id} value={building.id}>
                          {building.name}
                        </SelectItem>
                      ))}
                      {!isLoading && (!buildings || buildings.length === 0) && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              등록된 건물이 없습니다.
                          </div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    먼저 건물을 등록해야 임차인을 추가할 수 있습니다.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tenantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>이름</FormLabel>
                    <FormControl>
                      <Input placeholder="홍길동" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tenantContact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>연락처</FormLabel>
                    <FormControl>
                      <Input placeholder="010-1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tenantAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>주소</FormLabel>
                  <FormControl>
                    <Input placeholder="서울특별시 강남구 테헤란로 427" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unitIds"
              render={() => (
                <FormItem>
                    <div className="mb-4">
                        <FormLabel className="text-base">호실 선택</FormLabel>
                        <FormDescription>
                            임차인이 사용할 호실을 모두 선택하세요.
                        </FormDescription>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 rounded-lg border p-4 min-h-[120px]">
                    {selectedBuilding?.units?.map((unit) => (
                        <FormField
                        key={unit.id}
                        control={form.control}
                        name="unitIds"
                        render={({ field }) => {
                            return (
                            <FormItem
                                key={unit.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                            >
                                <FormControl>
                                <Checkbox
                                    checked={field.value?.includes(unit.id)}
                                    onCheckedChange={(checked) => {
                                    return checked
                                        ? field.onChange([...(field.value || []), unit.id])
                                        : field.onChange(
                                            field.value?.filter(
                                            (value) => value !== unit.id
                                            )
                                        )
                                    }}
                                />
                                </FormControl>
                                <FormLabel className="font-normal">
                                    {unit.name}
                                </FormLabel>
                            </FormItem>
                            )
                        }}
                        />
                    ))}
                    {(!selectedBuildingId || isLoading) && (
                        <div className="col-span-full flex items-center justify-center text-muted-foreground text-sm">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            호실 목록을 불러오는 중...
                        </div>
                    )}
                    {(selectedBuildingId && !isLoading && (!selectedBuilding?.units || selectedBuilding.units.length === 0)) && (
                        <p className="col-span-full text-center text-muted-foreground text-sm py-8">
                            선택한 건물에 등록된 호실이 없습니다. 건물 관리 메뉴에서 호실을 추가해주세요.
                        </p>
                    )}
                    </div>
                    <FormMessage />
                </FormItem>
                )}
            />
             <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="leaseDepositAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>임대 보증금 (원)</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="5,000,000"
                          value={ new Intl.NumberFormat('ko-KR').format(field.value || 0) }
                          onChange={(e) => {
                              const rawValue = e.target.value.replace(/,/g, '');
                              if (/^\d*$/.test(rawValue)) {
                                  field.onChange(Number(rawValue));
                              }
                          }}
                          />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rentAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>월 임대료 (원)</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="850,000"
                          value={ new Intl.NumberFormat('ko-KR').format(field.value || 0) }
                          onChange={(e) => {
                              const rawValue = e.target.value.replace(/,/g, '');
                              if (/^\d*$/.test(rawValue)) {
                                  field.onChange(Number(rawValue));
                              }
                          }}
                          />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
             </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="leaseStartDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>계약 시작일</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
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
                          captionLayout="dropdown-buttons"
                          fromYear={2000}
                          toYear={2050}
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="leaseEndDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>계약 종료일</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
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
                          captionLayout="dropdown-buttons"
                          fromYear={2000}
                          toYear={2050}
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormItem>
              <FormLabel>렌트프리 기간</FormLabel>
              <div className="flex items-center gap-4">
                <FormField
                  control={form.control}
                  name="rentFreePeriod"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rentFreeUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex items-center space-x-4"
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="months" />
                            </FormControl>
                            <FormLabel className="font-normal">개월</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="days" />
                            </FormControl>
                            <FormLabel className="font-normal">일</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormDescription>
                첫 계약 시 렌트프리 기간을 입력하세요.
              </FormDescription>
            </FormItem>
            
            <FormField
              control={form.control}
              name="vatTreatment"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>부가세 처리 방식</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="none" />
                        </FormControl>
                        <FormLabel className="font-normal">미발행</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="excluded" />
                        </FormControl>
                        <FormLabel className="font-normal">별도 (임대료에 10% 추가 청구)</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="included" />
                        </FormControl>
                        <FormLabel className="font-normal">포함 (임대료에 10% 포함됨)</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>결제 방식</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="결제 방식을 선택하세요" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bank_transfer">계좌이체</SelectItem>
                      <SelectItem value="credit_card">카드결제</SelectItem>
                      <SelectItem value="cash">현금</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rentCalculationMethod"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>임대료 계산 방식</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="contract_date" />
                        </FormControl>
                        <FormLabel className="font-normal">계약일 기준 (매월 동일 날짜)</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="end_of_month" />
                        </FormControl>
                        <FormLabel className="font-normal">말일 기준 (첫/마지막 달 일할 계산)</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEditMode && (
              <div>
                <Separator className="my-6" />
                <h3 className="text-lg font-medium mb-4">재계약 관리</h3>
                <div className="space-y-4">
                  {renewalFields.map((field, index) => (
                    <div key={field.id} className="p-4 border rounded-md space-y-4 relative">
                       <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-destructive"
                        onClick={() => removeRenewal(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <FormField
                        control={form.control}
                        name={`renewals.${index}.renewalDate`}
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>재계약 기준일</FormLabel>
                             <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
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
                                  captionLayout="dropdown-buttons"
                                  fromYear={2000}
                                  toYear={2050}
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`renewals.${index}.newRentAmount`}
                         render={({ field }) => (
                          <FormItem>
                            <FormLabel>새로운 월 임대료</FormLabel>
                            <FormControl>
                              <Input type="text" placeholder="900,000" value={new Intl.NumberFormat('ko-KR').format(field.value || 0)}
                                onChange={(e) => {
                                    const rawValue = e.target.value.replace(/,/g, '');
                                    if (/^\d*$/.test(rawValue)) field.onChange(Number(rawValue));
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`renewals.${index}.newLeaseEndDate`}
                        render={({ field }) => (
                           <FormItem className="flex flex-col">
                            <FormLabel>새로운 계약 종료일</FormLabel>
                             <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
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
                                  captionLayout="dropdown-buttons"
                                  fromYear={2000}
                                  toYear={2050}
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => appendRenewal({ id: uuidv4(), renewalDate: new Date(), newRentAmount: 0, newLeaseEndDate: new Date() })}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    재계약 추가
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <Button type="submit" className="flex-1" disabled={!user || isLoading || isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isSubmitting ? '저장 중...' : (isEditMode ? '계약 정보 저장' : '임차인 저장')}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                  취소
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
