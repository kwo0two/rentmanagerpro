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
import { initiateEmailSignIn } from '@/firebase/non-blocking-login';
import { useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';

const formSchema = z.object({
  email: z.string().email({ message: '유효한 이메일을 입력해주세요.' }),
  password: z.string().min(6, { message: '비밀번호는 6자 이상이어야 합니다.' }),
});

export function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { auth, firestore } = useFirebase();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
        if (user) {
            // User is signed in, redirect to the dashboard.
            toast({
                title: "로그인 성공",
                description: "대시보드로 이동합니다.",
            });
            router.push('/dashboard');
        }
        // if user is null, the form will just be displayed.
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [auth, router, toast]);


  function onSubmit(values: z.infer<typeof formSchema>) {
    initiateEmailSignIn(auth, firestore, values.email, values.password);
    // Don't show toast here, the onAuthStateChanged listener will handle it.
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>계정에 로그인하여 임대 관리를 시작하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            <Button type="submit" className="w-full">로그인</Button>
          </form>
        </Form>
        <div className="mt-4 text-center text-sm">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="underline">
            회원가입
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
