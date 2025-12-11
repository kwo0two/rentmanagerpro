'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, Home, Users, AlertCircle } from "lucide-react";
import { formatCurrency, getLeaseDetails } from "@/lib/utils";
import { useFirebase } from "@/firebase";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { Skeleton } from "../ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { Building, LeaseAgreement, Payment } from "@/lib/types";
import { isBefore } from "date-fns";

export function StatCards() {
  const { firestore, user } = useFirebase();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [leases, setLeases] = useState<LeaseAgreement[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!firestore || !user) return;

      setIsLoading(true);
      try {
        const buildingsQuery = query(collection(firestore, 'buildings'), where('ownerId', '==', user.uid));
        const leasesQuery = query(collection(firestore, 'leaseAgreements'), where('ownerId', '==', user.uid));
        
        const [buildingsSnapshot, leasesSnapshot] = await Promise.all([
            getDocs(buildingsQuery),
            getDocs(leasesQuery),
        ]);

        const buildingsData = buildingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Building));
        const leasesData = leasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaseAgreement));
        
        setBuildings(buildingsData);
        setLeases(leasesData);

        let paymentsData: Payment[] = [];
        if (leasesData.length > 0) {
            const leaseIds = leasesData.map(l => l.id);
            const paymentPromises = [];
            for (let i = 0; i < leaseIds.length; i += 30) {
                const batchIds = leaseIds.slice(i, i + 30);
                const paymentsQuery = query(
                    collection(firestore, 'payments'),
                    where('ownerId', '==', user.uid),
                    where('leaseAgreementId', 'in', batchIds)
                );
                paymentPromises.push(getDocs(paymentsQuery));
            }
            const paymentSnapshots = await Promise.all(paymentPromises);
            paymentsData = paymentSnapshots.flatMap(snapshot => snapshot.docs.map(doc => doc.data() as Payment));
        }
        setPayments(paymentsData);

      } catch (error) {
        console.error("Error fetching stats data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [firestore, user]);


  const stats = useMemo(() => {
    const today = new Date();
    const activeLeases = leases.filter(l => {
      const { leaseEndDate } = getLeaseDetails(l);
      return !isBefore(leaseEndDate, today);
    });

    const totalTenants = activeLeases.length;
    
    const totalUnitsInBuildings = buildings.reduce((sum, b) => sum + (b.units?.length || 0), 0);
    const occupiedUnits = new Set(activeLeases.flatMap(l => l.unitIds)).size;
    const occupancyRate = totalUnitsInBuildings > 0 ? (occupiedUnits / totalUnitsInBuildings) * 100 : 0;
    
    const totalMonthlyRent = activeLeases.reduce((sum, l) => {
        const { rentAmount } = getLeaseDetails(l);
        return sum + rentAmount;
    }, 0);

    const paymentsByLease = payments.reduce((acc, p) => {
        if (!acc[p.leaseAgreementId]) {
            acc[p.leaseAgreementId] = [];
        }
        acc[p.leaseAgreementId].push(p);
        return acc;
    }, {} as Record<string, Payment[]>);

    const overdueRent = activeLeases.reduce((totalOverdue, lease) => {
        const leasePayments = paymentsByLease[lease.id] || [];
        const totalPaid = leasePayments.reduce((sum, p) => sum + p.paymentAmount, 0);
        
        const { rentAmount, leaseEndDate } = getLeaseDetails(lease);
        const startDate = (lease.leaseStartDate as Timestamp).toDate();
        let totalDue = 0;
        let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

        while (currentDate <= today && currentDate <= leaseEndDate) {
            // This calculation is simplified. The ledger has the full logic.
            // For dashboard stats, using the current rent amount is a reasonable approximation.
            totalDue += rentAmount;
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        const balance = totalDue - totalPaid;
        return balance > 0 ? totalOverdue + balance : totalOverdue;
    }, 0);


    return {
        totalTenants,
        occupancyRate,
        totalMonthlyRent,
        overdueRent,
    }
  }, [leases, buildings, payments]);

  if (isLoading) {
    return (
        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
                <Card key={i}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-3 w-full mt-1" />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">총 임차인</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalTenants}</div>
          <p className="text-xs text-muted-foreground">현재 활성 계약 기준</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">입주율</CardTitle>
          <Home className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.occupancyRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">전체 호실 대비 입주율</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">월 총 임대료</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(stats.totalMonthlyRent)}</div>
          <p className="text-xs text-muted-foreground">활성 계약 기준 예상 수익</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">연체된 임대료</CardTitle>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">{formatCurrency(stats.overdueRent)}</div>
          <p className="text-xs text-muted-foreground">현재까지 누적된 연체 총액</p>
        </CardContent>
      </Card>
    </div>
  );
}
