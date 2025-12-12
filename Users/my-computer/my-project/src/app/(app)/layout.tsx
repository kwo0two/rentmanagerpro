'use client';

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar-nav";
import { useUser, useFirebase } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
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
  const { firestore } = useFirebase();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
      return;
    }

    if (user && firestore) {
      const fetchProfile = async () => {
        try {
          const userProfileRef = doc(firestore, 'users', user.uid);
          const docSnap = await getDoc(userProfileRef);
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
             console.error(`User profile document does not exist at /users/${user.uid}`);
             // This case might happen on first login if document creation is slow.
             // For now, we assume it's an error. A more robust solution might retry.
             setError(`사용자 프로필 문서가 Firestore에 존재하지 않습니다.`);
          }
        } catch (e: any) {
          console.error("Failed to fetch user profile:", e);
          setError(`프로필을 가져오는 중 오류가 발생했습니다: ${e.message}`);
        } finally {
          setProfileLoading(false);
        }
      };
      fetchProfile();
    }
  }, [user, isUserLoading, router, firestore]);

  const isLoading = isUserLoading || profileLoading;

  if (error) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-destructive text-destructive-foreground p-4">
            <div className="flex flex-col items-center text-center max-w-lg mx-auto">
                <ShieldAlert className="w-20 h-20 mb-6" />
                <h1 className="text-3xl font-bold mb-4">앱 로드 실패</h1>
                <p className="text-lg mb-2">오류가 발생하여 앱을 로드할 수 없습니다.</p>
                <div className="bg-black/20 p-4 rounded-md text-left mt-4 w-full">
                    <p className="font-semibold mb-2">오류 메시지:</p>
                    <pre className="text-sm whitespace-pre-wrap font-mono">{error}</pre>
                </div>
            </div>
        </div>
    );
  }

  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }

  // After loading, check the profile status
  if (user && profile && !profile.isApproved) {
      return <AwaitingApprovalScreen />;
  }
  
  // If still loading or no user/profile, show loader.
  // This also handles the brief moment before router pushes to /login
  if (!user || !profile) {
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
