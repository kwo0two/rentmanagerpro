'use client';

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar-nav";
import { useUser, useDoc, useMemoFirebase, useFirebase } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { doc } from "firebase/firestore";
import { UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { signOut } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { AppLogo } from "@/components/icons";

function AwaitingApprovalScreen() {
    const { auth } = useFirebase();
    const router = useRouter();
    const { toast } = useToast();

    const handleLogout = async () => {
        try {
          await signOut(auth);
          toast({ title: "로그아웃되었습니다." });
          router.push('/login');
        } catch (error) {
          console.error("Logout failed", error);
          toast({ variant: "destructive", title: "로그아웃 실패", description: "로그아웃 중 오류가 발생했습니다." });
        }
      };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center text-center p-8 max-w-md mx-auto">
            <ShieldAlert className="w-16 h-16 text-primary mb-6" />
            <h1 className="text-2xl font-bold mb-2">승인 대기 중</h1>
            <p className="text-muted-foreground mb-8">
                계정이 아직 관리자에 의해 승인되지 않았습니다. 승인 후 모든 기능을 사용할 수 있습니다.
            </p>
            <Button onClick={handleLogout}>로그아웃</Button>
        </div>
      </div>
    );
}


export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const { firestore, auth } = useFirebase();
  const router = useRouter();

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  const isLoading = isUserLoading || isProfileLoading;

  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }

  if (user && userProfile && !userProfile.isApproved) {
      return <AwaitingApprovalScreen />;
  }

  if (!user || !userProfile) {
     return (
        <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }
  

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
