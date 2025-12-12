'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '../ui/skeleton';
import { AlertTriangle, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useFirebase } from '@/firebase';
import { collection, query, Timestamp, getDocs } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Building, TenantLeaseInfo, Payment } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { isBefore } from 'date-fns';
import { getLeaseDetails } from '@/lib/utils';

interface AllTenantsTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
}

export function AllTenantsTable<TData extends TenantLeaseInfo, TValue>({
  columns,
}: AllTenantsTableProps<TData, TValue>) {
  const { firestore, user } = useFirebase();
  const router = useRouter();
  
  const [tableData, setTableData] = React.useState<TData[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const [sorting, setSorting] = React.useState<any[]>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  React.useEffect(() => {
    if (!user || !firestore) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const buildingsQuery = query(collection(firestore, 'buildings'));
        const leasesQuery = query(collection(firestore, 'leaseAgreements'));

        const [buildingsSnapshot, leasesSnapshot] = await Promise.all([
          getDocs(buildingsQuery),
          getDocs(leasesQuery),
        ]);

        const buildings = buildingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Building);
        const leases = leasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as TenantLeaseInfo);
        const buildingsMap = new Map(buildings.map(b => [b.id, b]));
        
        const leaseIds = leases.map(l => l.id);
        let allPayments: Payment[] = [];
        if (leaseIds.length > 0) {
            const paymentPromises = [];
            // Firestore 'in' query supports up to 30 elements
            for (let i = 0; i < leaseIds.length; i += 30) {
                const batchIds = leaseIds.slice(i, i + 30);
                const paymentsQuery = query(
                    collection(firestore, 'payments'),
                    where('leaseAgreementId', 'in', batchIds)
                );
                paymentPromises.push(getDocs(paymentsQuery));
            }
            const paymentSnapshots = await Promise.all(paymentPromises);
            allPayments = paymentSnapshots.flatMap(snapshot => snapshot.docs.map(doc => doc.data() as Payment));
        }

        const paymentsByLease = new Map<string, Payment[]>();
        allPayments.forEach(p => {
            if (!paymentsByLease.has(p.leaseAgreementId)) {
                paymentsByLease.set(p.leaseAgreementId, []);
            }
            paymentsByLease.get(p.leaseAgreementId)!.push(p);
        });

        // This calculation is now safe inside useEffect
        const today = new Date();
        const leaseDataWithDetails = leases.map(lease => {
          const payments = paymentsByLease.get(lease.id) || [];
          const startDate = (lease.leaseStartDate as Timestamp).toDate();
          
          const { rentAmount, leaseEndDate } = getLeaseDetails(lease);

          let totalDue = 0;
          // Create a date object that doesn't affect other calculations.
          let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
          
          // Calculate total rent due from the start of the lease until today
          while (currentDate <= today && currentDate <= leaseEndDate) {
            // A simplified calculation for the dashboard.
            // For exact amounts, the tenant ledger should be used.
            totalDue += rentAmount; 
            currentDate.setMonth(currentDate.getMonth() + 1);
          }

          const totalPaid = payments.reduce((sum, p) => sum + p.paymentAmount, 0);
          const balance = totalDue - totalPaid;
          
          let status: TenantLeaseInfo['status'];
          if (isBefore(leaseEndDate, today)) {
            status = 'vacant';
          } else if (balance > 0) {
            status = 'overdue';
          } else {
            status = 'paid';
          }
          
          const building = buildingsMap.get(lease.buildingId);
          const unitNames = (lease.unitIds || []).map(unitId => building?.units?.find(u => u.id === unitId)?.name || unitId);
          
          return {
            ...lease,
            leaseEndDate: leaseEndDate, // Use the effective end date
            balance,
            status,
            unitNames,
          };
        }) as TData[];
        
        setTableData(leaseDataWithDetails);

      } catch (err: any) {
        console.error("Error fetching all tenants data:", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [firestore, user]);


  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      pagination,
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center py-4 justify-between">
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {[...Array(6)].map((_, i) => (
                  <TableHead key={i}>
                    <Skeleton className="h-6 w-full" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(pagination.pageSize)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>오류 발생</AlertTitle>
        <AlertDescription className="whitespace-pre-wrap">
          임차인 목록을 불러오는 중 오류가 발생했습니다: {error.message}
        </AlertDescription>
      </Alert>
    );
  }
  
  const showNoTenantsMessage = !isLoading && tableData.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between py-4">
        <Input
          placeholder="이름으로 검색..."
          value={(table.getColumn('tenantName')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('tenantName')?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
          disabled={showNoTenantsMessage && !table.getState().columnFilters.length}
        />
      </div>
      
      {showNoTenantsMessage ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed shadow-sm p-8 text-center h-[400px]">
            <Users className="w-16 h-16 text-muted-foreground" />
            <h2 className="mt-6 text-xl font-semibold">등록된 임차인이 없습니다.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
            새로운 임차인을 추가하여 임대 관리를 시작하세요.
            </p>
        </div>
       ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className="cursor-pointer"
                      onClick={() => router.push(`/tenants/${row.original.id}`)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end space-x-2 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
              총 {table.getFilteredRowModel().rows.length}명의 임차인
            </div>
            <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">페이지당 행 수</p>
                <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                    table.setPageSize(Number(value))
                }}
                >
                <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>
            <div className="flex w-[100px] items-center justify-center text-sm font-medium">
              페이지 {table.getState().pagination.pageIndex + 1} /{' '}
              {table.getPageCount()}
            </div>
            <div className="flex items-center space-x-2">
                <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                >
                <span className="sr-only">첫 페이지로 가기</span>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.46967 4.12853C9.76256 3.83564 9.76256 3.36077 9.46967 3.06788C9.17678 2.77498 8.7019 2.77498 8.40901 3.06788L4.40901 7.06788C4.26256 7.21432 4.18182 7.40176 4.18182 7.59703C4.18182 7.7923 4.26256 7.97974 4.40901 8.12618L8.40901 12.1262C8.7019 12.4191 9.17678 12.4191 9.46967 12.1262C9.76256 11.8333 9.76256 11.3584 9.46967 11.0655L5.90414 7.59703L9.46967 4.12853Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path><path d="M2 12.5C2 12.7761 2.22386 13 2.5 13H4C4.27614 13 4.5 12.7761 4.5 12.5V2.5C4.5 2.22386 4.27614 2 4 2H2.5C2.22386 2 2 2.22386 2 2.5V12.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                </Button>
                <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                >
                <span className="sr-only">이전 페이지로 가기</span>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.84182 3.13514C9.04327 3.33659 9.04327 3.66341 8.84182 3.86486L5.20667 7.5L8.84182 11.1351C9.04327 11.3366 9.04327 11.6634 8.84182 11.8649C8.64037 12.0663 8.31355 12.0663 8.1121 11.8649L4.1121 7.86486C3.99616 7.74892 3.93333 7.62251 3.93333 7.5C3.93333 7.37749 3.99616 7.25108 4.1121 7.13514L8.1121 3.13514C8.31355 2.93369 8.64037 2.93369 8.84182 3.13514Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                </Button>
                <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                >
                <span className="sr-only">다음 페이지로 가기</span>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.15818 3.13514C5.95673 3.33659 5.95673 3.66341 6.15818 3.86486L9.79333 7.5L6.15818 11.1351C5.95673 11.3366 5.95673 11.6634 6.15818 11.8649C6.35963 12.0663 6.68645 12.0663 6.8879 11.8649L10.8879 7.86486C11.0038 7.74892 11.0667 7.62251 11.0667 7.5C11.0667 7.37749 11.0038 7.25108 10.8879 7.13514L6.8879 3.13514C6.68645 2.93369 6.35963 2.93369 6.15818 3.13514Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                </Button>
                <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                >
                <span className="sr-only">마지막 페이지로 가기</span>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2.5C2 2.22386 2.22386 2 2.5 2H4C4.27614 2 4.5 2.22386 4.5 2.5V12.5C4.5 12.7761 4.27614 13 4 13H2.5C2.22386 13 2 12.7761 2 12.5V2.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path><path d="M5.53033 3.06788C5.23744 2.77498 4.76256 2.77498 4.46967 3.06788L0.46967 7.06788C0.323223 7.21432 0.242488 7.40176 0.242488 7.59703C0.242488 7.7923 0.323223 7.97974 0.46967 8.12618L4.46967 12.1262C4.76256 12.4191 5.23744 12.4191 5.53033 12.1262C5.82322 11.8333 5.82322 11.3584 5.53033 11.0655L2.09586 7.59703L5.53033 4.12853C5.67678 3.98209 5.75751 3.79465 5.75751 3.59938C5.75751 3.40411 5.67678 3.21667 5.53033 3.06788Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                </Button>
            </div>
          </div>
        </>
       )}
    </div>
  );
}
