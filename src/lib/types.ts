import { type DocumentReference, type Timestamp } from 'firebase/firestore';

export type TenantStatus = 'paid' | 'overdue' | 'vacant';

export interface Payment {
  id: string;
  ownerId: string;
  leaseAgreementId: string;
  paymentDate: Timestamp | Date;
  paymentAmount: number;
}

export interface BuildingUnit {
  id: string;
  name: string;
  area: number;
}

export interface Renewal {
  renewalDate: Timestamp | Date;
  newRentAmount: number;
  newLeaseEndDate: Timestamp | Date;
}

export interface LeaseAgreement {
  id: string;
  ownerId: string;
  buildingId: string;
  buildingName: string;
  tenantName: string;
  tenantContact: string;
  tenantAddress: string;
  unitIds: string[];
  leaseStartDate: Timestamp | Date;
  leaseEndDate: Timestamp | Date;
  leaseDepositAmount: number;
  rentAmount: number;
  vatTreatment: 'none' | 'included' | 'excluded';
  paymentMethod: string;
  rentCalculationMethod: 'contract_date' | 'end_of_month';
  rentFreePeriod?: number;
  rentFreeUnit?: 'days' | 'months';
  renewals?: Renewal[];
}

export interface RentAdjustment {
  id: string;
  ownerId: string;
  leaseAgreementId: string;
  adjustmentDate: Timestamp; // 조정 대상 월의 1일
  adjustedRentAmount: number;
  notes: string;
}

// This represents the combined data for the tenant table, directly from the LeaseAgreement document
export interface TenantLeaseInfo extends LeaseAgreement {
  status: TenantStatus;
  balance: number;
  unitNames?: string[]; // For display
}


export interface Building {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  units?: BuildingUnit[];
}

export interface UserProfile {
  id: string; // Corresponds to Firebase Auth UID
  email: string;
  displayName?: string;
  isApproved: boolean; // 사용자가 앱 사용을 승인받았는지 여부
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  timestamp: Timestamp;
  details?: Record<string, any>;
}
