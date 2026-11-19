import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AuditEntry } from './types';

export const logCoachAudit = async (entry: Omit<AuditEntry, 'timestamp'>) => {
    await addDoc(collection(db, 'auditTrail'), {
        ...entry,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timestamp: serverTimestamp(),
    });
};