import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format as formatFns } from "date-fns"
import { ko } from "date-fns/locale"
import { Timestamp } from "firebase/firestore";
import { utcToZonedTime } from 'date-fns-tz';
import { LeaseAgreement, Renewal } from "./types";
import { isAfter } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(amount);
}

export function formatDate(date: Date | Timestamp | string | undefined | null): string {
  if (!date) {
    return "";
  }

  let dateObj: Date;

  if (date instanceof Timestamp) {
    dateObj = date.toDate();
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    dateObj = new Date(date);
  }

  if (isNaN(dateObj.getTime())) {
    return "유효하지 않은 날짜";
  }
  
  const timeZone = 'Asia/Seoul';
  try {
    const zonedDate = utcToZonedTime(dateObj, timeZone);
    return formatFns(zonedDate, "yyyy년 M월 d일", { locale: ko });
  } catch (error) {
     try {
      return formatFns(dateObj, "yyyy년 M월 d일", { locale: ko });
    } catch (fallbackError) {
      console.error("Error formatting date (fallback):", fallbackError);
      return "날짜 오류";
    }
  }
}

/**
 * Gets the current rent amount and the effective lease end date, considering renewals.
 * @param lease The lease agreement object.
 * @returns An object with the current rent amount and the final lease end date.
 */
export function getLeaseDetails(lease: LeaseAgreement): { rentAmount: number; leaseEndDate: Date, isRenewed: boolean } {
  const today = new Date();
  let currentRent = lease.rentAmount;
  let finalLeaseEndDate = (lease.leaseEndDate instanceof Timestamp ? lease.leaseEndDate.toDate() : lease.leaseEndDate);
  let isRenewed = false;

  if (lease.renewals && lease.renewals.length > 0) {
    // Sort renewals by date to find the most recent applicable one
    const sortedRenewals = [...lease.renewals].sort((a, b) => {
      const dateA = a.renewalDate instanceof Timestamp ? a.renewalDate.toDate() : a.renewalDate;
      const dateB = b.renewalDate instanceof Timestamp ? b.renewalDate.toDate() : b.renewalDate;
      return dateA.getTime() - dateB.getTime();
    });

    // Find the latest renewal that has already started
    for (const renewal of sortedRenewals) {
      const renewalDate = renewal.renewalDate instanceof Timestamp ? renewal.renewalDate.toDate() : renewal.renewalDate;
      if (isAfter(today, renewalDate) || isAfter(new Date(), renewalDate)) {
        currentRent = renewal.newRentAmount;
        isRenewed = true;
      }
    }

    // Find the latest end date from all renewals
    const latestRenewal = sortedRenewals[sortedRenewals.length - 1];
    const latestEndDate = latestRenewal.newLeaseEndDate instanceof Timestamp ? latestRenewal.newLeaseEndDate.toDate() : latestRenewal.newLeaseEndDate;
    
    if (isAfter(latestEndDate, finalLeaseEndDate)) {
        finalLeaseEndDate = latestEndDate;
    }
  }

  return { rentAmount: currentRent, leaseEndDate: finalLeaseEndDate, isRenewed };
}