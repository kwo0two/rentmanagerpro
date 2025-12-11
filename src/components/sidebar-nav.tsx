'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Building, ShieldCheck, Wallet, Settings } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { AppLogo } from './icons';
import { useUser } from '@/firebase';

const menuItems = [
  {
    href: '/dashboard',
    icon: Home,
    label: '대시보드',
  },
  {
    href: '/buildings',
    icon: Building,
    label: '건물 관리',
  },
  {
    href: '/tenants',
    icon: Users,
    label: '임차인 관리',
  },
  {
    href: '/payments',
    icon: Wallet,
    label: '납부 기록 관리',
  },
  {
    href: '/audit-logs',
    icon: ShieldCheck,
    label: '활동 기록',
  }
];

const bottomMenuItems = [
    {
        href: '/settings',
        icon: Settings,
        label: '설정'
    }
]

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  if (!user) {
    return null; // Don't render sidebar if no user
  }

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-r no-print">
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <AppLogo className="w-8 h-8 text-primary" />
          <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">
            임대료 관리
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref>
                <SidebarMenuButton
                  isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                  tooltip={item.label}
                  asChild
                >
                  <div>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </div>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2 mt-auto">
        <SidebarMenu>
            {bottomMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                    <Link href={item.href} passHref>
                        <SidebarMenuButton
                            isActive={pathname.startsWith(item.href)}
                            tooltip={item.label}
                            asChild
                        >
                            <div>
                                <item.icon className="h-5 w-5" />
                                <span>{item.label}</span>
                            </div>
                        </SidebarMenuButton>
                    </Link>
                </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
