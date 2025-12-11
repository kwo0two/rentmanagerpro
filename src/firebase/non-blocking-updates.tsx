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

/**
 * Initiates a setDoc operation for a document reference.
 * Does NOT await the write operation internally.
 */
export function setDocumentNonBlocking(docRef: DocumentReference, data: any, options?: SetOptions) {
  setDoc(docRef, data, options || {})
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
 * Initiates an addDoc operation for a document reference.
 */
export function addDocumentNonBlocking(docRef: DocumentReference, data: any) {
  setDoc(docRef, data)
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
 * Initiates an updateDoc operation for a document reference.
 */
export function updateDocumentNonBlocking(docRef: DocumentReference, data: any) {
  updateDoc(docRef, data)
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
 * Initiates a deleteDoc operation for a document reference.
 */
export function deleteDocumentNonBlocking(docRef: DocumentReference) {
  deleteDoc(docRef)
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
export async function deleteLeaseAgreementWithRelations(firestore: Firestore, leaseId: string) {
    if (!leaseId) return;

    const batch = writeBatch(firestore);

    // 1. Delete the lease agreement itself
    const leaseRef = doc(firestore, 'leaseAgreements', leaseId);
    batch.delete(leaseRef);

    // 2. Find and delete related payments
    const paymentsQuery = query(collection(firestore, 'payments'), where('leaseAgreementId', '==', leaseId));
    const paymentsSnapshot = await getDocs(paymentsQuery);
    paymentsSnapshot.forEach(doc => batch.delete(doc.ref));
    
    // 3. Find and delete related rent adjustments
    const adjustmentsQuery = query(collection(firestore, 'rentAdjustments'), where('leaseAgreementId', '==', leaseId));
    const adjustmentsSnapshot = await getDocs(adjustmentsQuery);
    adjustmentsSnapshot.forEach(doc => batch.delete(doc.ref));

    try {
        await batch.commit();
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
export async function updateRentAdjustment(firestore: Firestore, adjustmentId: string, data: any) {
    const adjustmentRef = doc(firestore, 'rentAdjustments', adjustmentId);
    try {
        await setDoc(adjustmentRef, data, { merge: true });
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

export async function deleteRentAdjustment(firestore: Firestore, adjustmentId: string) {
    const adjustmentRef = doc(firestore, 'rentAdjustments', adjustmentId);
    try {
        await deleteDoc(adjustmentRef);
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
