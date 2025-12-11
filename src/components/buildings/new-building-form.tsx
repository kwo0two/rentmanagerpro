'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

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
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

const formSchema = z.object({
  name: z.string().min(1, { message: '건물 이름을 입력해주세요.' }),
  address: z.string().min(1, { message: '주소를 입력해주세요.' }),
});

export function NewBuildingForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { firestore, user } = useFirebase();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user) {
        toast({
            variant: 'destructive',
            title: '오류',
            description: '로그인이 필요합니다.',
        });
        return;
    }

    try {
        const newBuildingId = uuidv4();
        const buildingRef = doc(firestore, 'buildings', newBuildingId);
        
        await addDocumentNonBlocking(buildingRef, {
            id: newBuildingId,
            ...values,
            ownerId: user.uid,
            units: [],
        },
        {
          userId: user.uid,
          userEmail: user.email || 'N/A',
          action: 'create_building',
          details: { buildingId: newBuildingId, name: values.name },
        });

        toast({
            title: '건물 추가됨',
            description: `${values.name} 건물이 성공적으로 추가되었습니다.`,
        });
        router.push('/buildings');
    } catch (error) {
        console.error("Error adding document: ", error);
        toast({
            variant: 'destructive',
            title: '오류',
            description: '건물을 추가하는 중 오류가 발생했습니다.',
        });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>새 건물 정보</CardTitle>
        <CardDescription>관리할 건물의 이름과 주소를 입력하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>건물 이름</FormLabel>
                  <FormControl>
                    <Input placeholder="예: 스타워크 빌딩" {...field} />
                  </FormControl>
                  <FormDescription>
                    관리 앱 내에서 건물을 식별하기 위한 이름입니다.
                  </FormDescription>
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
                  <FormDescription>
                    건물의 실제 주소를 입력하세요.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">건물 저장</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
