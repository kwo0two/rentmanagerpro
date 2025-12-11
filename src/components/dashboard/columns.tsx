'use client';

import type { TenantLeaseInfo } from '@/lib/types';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import Link from 'next/link';

const statusVariantMap: {
  [key in TenantLeaseInfo['status']]:
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline';
} = {
  paid: 'default',
  overdue: 'destructive',
  vacant: 'outline',
};

const statusTextMap: { [key in TenantLeaseInfo['status']]: string } = {
  paid: '납부 완료',
  overdue: '연체',
  vacant: '공실',
};

export const columns: ColumnDef<TenantLeaseInfo>[] = [
  {
    accessorKey: 'unitNames',
    header: '호수',
    cell: ({ row }) => {
      const lease = row.original;
      const unitNames = row.getValue('unitNames') as string[] | undefined;
      return (
        <div className="font-medium">
          <Link href={`/tenants/${lease.id}`} className="hover:underline">
            {lease.buildingName} {unitNames?.join(', ')}
          </Link>
        </div>
      );
    },
  },
  {
    accessorKey: 'tenantName',
    header: '이름',
  },
  {
    accessorKey: 'leaseEndDate',
    header: '계약 종료일',
    cell: ({ row }) => {
      const date = row.getValue('leaseEndDate') as Timestamp | Date | string;
      return formatDate(date);
    },
  },
  {
    accessorKey: 'status',
    header: '상태',
    cell: ({ row }) => {
      const status = row.getValue('status') as TenantLeaseInfo['status'];
      return <Badge variant={statusVariantMap[status]}>{statusTextMap[status]}</Badge>;
    },
  },
  {
    accessorKey: 'balance',
    header: () => <div className="text-right">잔액</div>,
    cell: ({ row }) => {
      const balance = parseFloat(row.getValue('balance'));
      return (
        <div
          className={cn(
            'text-right font-medium',
            balance > 0 ? 'text-destructive' : ''
          )}
        >
          {formatCurrency(balance)}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const lease = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">메뉴 열기</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>작업</DropdownMenuLabel>
            <DropdownMenuItem asChild>
                <Link href={`/tenants/${lease.id}`}>상세 정보 보기</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link href={`/tenants/${lease.id}/edit`}>계약 수정</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(lease.tenantContact)}
            >
              연락처 복사
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
