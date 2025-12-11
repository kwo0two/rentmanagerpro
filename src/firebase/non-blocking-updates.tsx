'use client';
    
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  doc,
  collection,
  query,
  where,
  getDocs,
  Firestore,
  DocumentReference,
  SetOptions,
  CollectionReference,
  serverTimestamp,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import {FirestorePermissionError} from '@/firebase/errors';
import { v4 as uuidv4 } from 'uuid';


type AuditLogDetails = {
  userId: string;
  userEmail: string;
  action: string;
  details: Record<string, any>;
}

async function createAuditLog(firestore: Firestore, logDetails: AuditLogDetails) {
    if (!logDetails.userId) return; // Do not log if no user is available
    try {
        const logRef = doc(collection(firestore, 'logs'), uuidv4());
        await setDoc(logRef, {
            ...logDetails,
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error("Failed to create audit log:", error);
        // We don't want to block the main operation if logging fails
    }
}


/**
 * Initiates a setDoc operation for a document reference with audit logging.
 * Does NOT await the write operation internally.
 */
export function setDocumentNonBlocking(docRef: DocumentReference, data: any, options: SetOptions, auditDetails?: AuditLogDetails) {
  setDoc(docRef, data, options)
    .then(() => {
        if (auditDetails && docRef.firestore) {
            createAuditLog(docRef.firestore, auditDetails);
        }
    })
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'write', 
          requestResourceData: data,
        })
      )
    })
}


/**
 * Initiates an addDoc operation for a document reference with audit logging.
 */
export function addDocumentNonBlocking(docRef: DocumentReference, data: any, auditDetails?: AuditLogDetails) {
  setDoc(docRef, data)
    .then(() => {
        if (auditDetails && docRef.firestore) {
            createAuditLog(docRef.firestore, auditDetails);
        }
    })
    .catch(error => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'create',
        requestResourceData: data,
      })
    )
  });
}


/**
 * Initiates an updateDoc operation for a document reference with audit logging.
 */
export function updateDocumentNonBlocking(docRef: DocumentReference, data: any, auditDetails?: AuditLogDetails) {
  updateDoc(docRef, data)
    .then(() => {
        if (auditDetails && docRef.firestore) {
            createAuditLog(docRef.firestore, auditDetails);
        }
    })
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: data,
        })
      )
    });
}


/**
 * Initiates a deleteDoc operation for a document reference with audit logging.
 */
export function deleteDocumentNonBlocking(docRef: DocumentReference, auditDetails?: AuditLogDetails) {
  deleteDoc(docRef)
    .then(() => {
        if (auditDetails && docRef.firestore) {
            createAuditLog(docRef.firestore, auditDetails);
        }
    })
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        })
      )
    });
}

/**
 * Deletes a lease agreement and all related payments and rent adjustments.
 */
export async function deleteLeaseAgreementWithRelations(firestore: Firestore, leaseId: string, auditDetails?: AuditLogDetails) {
    if (!leaseId) return;

    const writeBatch = writeBatch(firestore);

    // 1. Delete the lease agreement itself
    const leaseRef = doc(firestore, 'leaseAgreements', leaseId);
    writeBatch.delete(leaseRef);

    // 2. Find and delete related payments
    const paymentsQuery = query(collection(firestore, 'payments'), where('leaseAgreementId', '==', leaseId));
    const paymentsSnapshot = await getDocs(paymentsQuery);
    paymentsSnapshot.forEach(doc => writeBatch.delete(doc.ref));
    
    // 3. Find and delete related rent adjustments
    const adjustmentsQuery = query(collection(firestore, 'rentAdjustments'), where('leaseAgreementId', '==', leaseId));
    const adjustmentsSnapshot = await getDocs(adjustmentsQuery);
    adjustmentsSnapshot.forEach(doc => writeBatch.delete(doc.ref));

    try {
        await writeBatch.commit();
        if (auditDetails) {
            await createAuditLog(firestore, auditDetails);
        }
        console.log(`Successfully deleted lease ${leaseId} and all related documents.`);
    } catch (error) {
        console.error("Error deleting lease agreement with relations:", error);
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: `leaseAgreements/${leaseId} and subcollections`,
              operation: 'delete',
            })
        );
    }
}


/**
 * Updates a single rent adjustment record, creating it if it doesn't exist.
 */
export async function updateRentAdjustment(firestore: Firestore, adjustmentId: string, data: any, auditDetails: AuditLogDetails) {
    const adjustmentRef = doc(firestore, 'rentAdjustments', adjustmentId);
    try {
        await setDoc(adjustmentRef, data, { merge: true });
        await createAuditLog(firestore, auditDetails);
    } catch (error) {
         errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: adjustmentRef.path,
              operation: 'write',
              requestResourceData: data,
            })
        );
        throw error;
    }
}

export async function deleteRentAdjustment(firestore: Firestore, adjustmentId: string, auditDetails: AuditLogDetails) {
    const adjustmentRef = doc(firestore, 'rentAdjustments', adjustmentId);
    try {
        await deleteDoc(adjustmentRef);
        await createAuditLog(firestore, auditDetails);
    } catch (error) {
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: adjustmentRef.path,
              operation: 'delete',
            })
        );
        throw error;
    }
}
