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
import { onAuthStateChanged, User, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

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
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
        if (user && user.displayName) { // Check if displayName is already set
            toast({
                title: "회원가입 성공",
                description: "로그인 되었습니다. 대시보드로 이동합니다.",
            });
            router.push('/dashboard');
        } else if (user && !user.displayName) {
          // This block runs after createUserWithEmailAndPassword succeeds
          const { displayName } = form.getValues();
          try {
            await updateProfile(user, { displayName });
            
            // Create user profile in Firestore
            const userRef = doc(firestore, "users", user.uid);
            await setDoc(userRef, {
              id: user.uid,
              email: user.email,
              displayName: displayName,
              isApproved: false, // Default to not approved
            });
            
            // Now everything is set up, trigger the redirect and toast
            toast({
                title: "회원가입 성공",
                description: "승인 대기 중입니다. 관리자 승인 후 모든 기능을 사용할 수 있습니다.",
            });
            router.push('/dashboard');

          } catch (error) {
            console.error("Error setting user profile:", error);
            toast({ variant: 'destructive', title: '프로필 생성 실패', description: '사용자 프로필을 설정하는 중 오류가 발생했습니다.'});
          }
        }
    });
    return () => unsubscribe();
  }, [auth, firestore, router, toast, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    // We only create the user here. The profile update and DB write happens in onAuthStateChanged
    initiateEmailSignUp(auth, values.email, values.password);
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
