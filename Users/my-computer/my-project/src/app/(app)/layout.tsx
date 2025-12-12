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
  
  useEffect(() => {
    // 1. Redirect to login if user is not logged in after initial auth check
    if (!isUserLoading && !user) {
      router.push('/login');
      return;
    }

    // 2. Fetch profile only when we have a user and firestore instance
    if (user && firestore) {
      const userProfileRef = doc(firestore, 'users', user.uid);
      
      const fetchProfile = async () => {
        try {
          const docSnap = await getDoc(userProfileRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // This can happen on first signup before the document is created.
            // We'll treat it as "not approved" for now. The component will re-render
            // once the signup process creates the document.
            console.warn(`User profile for ${user.uid} not found. Awaiting creation...`);
            setProfile(null);
          }
        } catch (e: any) {
          // This will catch actual errors, like permission denied if rules are wrong.
          console.error("Failed to fetch user profile:", e);
          // For permission errors, we can treat them as "not approved" to show the waiting screen.
          setProfile(null); 
        } finally {
          setProfileLoading(false);
        }
      };
      fetchProfile();
    }
  }, [user, isUserLoading, router, firestore]);

  // Combined loading state
  const isLoading = isUserLoading || profileLoading;

  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }

  // After loading, if we have a user but their profile is not approved (or not found yet), show the approval screen.
  if (user && (!profile || !profile.isApproved)) {
      return <AwaitingApprovalScreen />;
  }

  // If everything is loaded and the user is approved, show the app.
  if (user && profile?.isApproved) {
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

  // Fallback loading screen for any other edge cases before redirects happen.
  return (
    <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
    </div>
  );
}
