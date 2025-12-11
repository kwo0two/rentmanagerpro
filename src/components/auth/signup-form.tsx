'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { useFirebase } from '@/firebase';
import { initiateEmailSignUp } from '@/firebase/non-blocking-login';
import { useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';

const formSchema = z.object({
  displayName: z.string().min(2, { message: '이름은 2자 이상이어야 합니다.' }),
  email: z.string().email({ message: '유효한 이메일을 입력해주세요.' }),
  password: z.string().min(6, { message: '비밀번호는 6자 이상이어야 합니다.' }),
});

export function SignUpForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { auth, firestore } = useFirebase();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
        if (user) {
            toast({
                title: "회원가입 성공",
                description: "로그인 되었습니다. 대시보드로 이동합니다.",
            });
            router.push('/dashboard');
        }
    });
    return () => unsubscribe();
  }, [auth, router, toast]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    initiateEmailSignUp(auth, firestore, values.email, values.password, values.displayName);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>회원가입</CardTitle>
        <CardDescription>새 계정을 만들어 임대 관리를 시작하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
                control={form.control}
                name="displayName"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="manager@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비밀번호</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">회원가입</Button>
          </form>
        </Form>
        <div className="mt-4 text-center text-sm">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="underline">
            로그인
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
