'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

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
import { useFirebase } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { doc, getDoc } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';
import { Building } from '@/lib/types';
import { PlusCircle, Trash2 } from 'lucide-react';
import { Separator } from '../ui/separator';

const unitSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: '호실 이름을 입력해주세요.' }),
  area: z.coerce.number().min(0, { message: '면적은 0 이상이어야 합니다.' }),
});

const formSchema = z.object({
  name: z.string().min(1, { message: '건물 이름을 입력해주세요.' }),
  address: z.string().min(1, { message: '주소를 입력해주세요.' }),
  units: z.array(unitSchema).optional(),
});

type EditBuildingFormProps = {
  buildingId: string;
};

export function EditBuildingForm({ buildingId }: EditBuildingFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { firestore, user } = useFirebase();
  const [isLoadingBuilding, setIsLoadingBuilding] = useState(true);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      units: [],
    },
  });

  useEffect(() => {
    async function fetchBuilding() {
      if (!firestore || !buildingId) return;
      setIsLoadingBuilding(true);
      try {
        const buildingRef = doc(firestore, 'buildings', buildingId);
        const docSnap = await getDoc(buildingRef);
        if (docSnap.exists()) {
          const building = docSnap.data() as Building;
          form.reset({
            name: building.name,
            address: building.address,
            units: building.units || [],
          });
        }
      } catch (error) {
        console.error("Error fetching building:", error);
        toast({ variant: 'destructive', title: '건물 정보 로딩 실패' });
      } finally {
        setIsLoadingBuilding(false);
      }
    }
    fetchBuilding();
  }, [firestore, buildingId, form, toast]);


  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'units',
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user || !buildingId) {
      toast({
        variant: 'destructive',
        title: '오류',
        description: '로그인이 필요합니다.',
      });
      return;
    }
    const buildingRef = doc(firestore, 'buildings', buildingId);

    try {
      await updateDocumentNonBlocking(buildingRef, {
        ...values,
      },
      {
        userId: user.uid,
        userEmail: user.email || 'N/A',
        action: 'update_building',
        details: { buildingId, name: values.name, address: values.address },
      });

      toast({
        title: '건물 정보 수정됨',
        description: `${values.name} 건물의 정보가 성공적으로 수정되었습니다.`,
      });
      router.push('/buildings');
    } catch (error) {
      console.error('Error updating document: ', error);
      toast({
        variant: 'destructive',
        title: '오류',
        description: '건물 정보를 수정하는 중 오류가 발생했습니다.',
      });
    }
  }
  
  if (isLoadingBuilding) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-8">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Separator />
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-1/4" />
            </CardContent>
        </Card>
    )
  }

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>건물 정보</CardTitle>
            <CardDescription>건물의 이름, 주소 및 호실 목록을 관리하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>건물 이름</FormLabel>
                  <FormControl>
                    <Input placeholder="예: 스타워크 빌딩" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>건물 주소</FormLabel>
                  <FormControl>
                    <Input placeholder="예: 서울특별시 강남구 테헤란로 427" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div>
              <h3 className="text-lg font-medium mb-4">호실 관리</h3>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name={`units.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                           <FormLabel className="sr-only">호실 이름</FormLabel>
                          <FormControl>
                            <Input placeholder={`예: ${101 + index}호`} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`units.${index}.area`}
                      render={({ field }) => (
                        <FormItem>
                           <FormLabel className="sr-only">면적</FormLabel>
                          <FormControl>
                            <div className="relative">
                               <Input type="number" className="w-28 pr-8" placeholder="면적" {...field} />
                               <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">㎡</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
               <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => append({ id: uuidv4(), name: '', area: 0 })}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  호실 추가
                </Button>
            </div>

            <Button type="submit">건물 정보 저장</Button>
          </CardContent>
        </form>
      </Form>
    </Card>
  );
}
