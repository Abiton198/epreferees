// src/services/appointmentService.ts

import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";

import type { Appointment, AppointmentStatus, AuditLog, Profile, UserRole } from "@/types";

// ────────────────────────────────────────────────
// 🔍 FETCH REFEREES
// ────────────────────────────────────────────────
export const fetchReferees = async (): Promise<Profile[]> => {
  const q = query(collection(db, "users"), where("role", "==", "referee"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Profile[];
};

// ────────────────────────────────────────────────
// 🔍 FETCH PROFILE BY ID
// ────────────────────────────────────────────────
export const fetchProfileById = async (id: string): Promise<Profile | null> => {
  const snap = await getDoc(doc(db, "users", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Profile;
};

// ────────────────────────────────────────────────
// 📜 AUDIT HELPER — appends to array field ONLY
// This is the single source of truth for audit entries.
// Do NOT use a subcollection — that caused duplicate entries.
// ────────────────────────────────────────────────
const appendAudit = (
  appointmentId: string,
  action: string,
  actor: { id: string; role: string; full_name?: string; name?: string },
  details?: any
) => {
  const name = actor.full_name || actor.name || 'Unknown';
  return updateDoc(doc(db, "appointments", appointmentId), {
    auditTrail: arrayUnion({
      action,
      by: actor.id,
      byName: name,
      byRole: actor.role,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    }),
  });
};

// ────────────────────────────────────────────────
// 📅 FETCH COACH APPOINTMENTS
// ────────────────────────────────────────────────
export const fetchCoachAppointments = async (coachId: string): Promise<Appointment[]> => {
  const q = query(
    collection(db, "appointments"),
    where("coach_id", "==", coachId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
};

// ────────────────────────────────────────────────
// 📅 FETCH REFEREE APPOINTMENTS
// ────────────────────────────────────────────────
export const fetchRefereeAppointments = async (refereeId: string): Promise<Appointment[]> => {
  const q = query(
    collection(db, "appointments"),
    where("refereeId", "==", refereeId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
};

// ────────────────────────────────────────────────
// ➕ CREATE APPOINTMENT
// ────────────────────────────────────────────────
export const createAppointment = async (
  payload: any,
  actor: { id: string; role: UserRole; full_name?: string }
): Promise<Appointment> => {
  const referee = payload.refereeId ? await fetchProfileById(payload.refereeId) : null;

  const docRef = await addDoc(collection(db, "appointments"), {
    ...payload,
    refereeName: referee?.full_name || payload.refereeName || "",
    refereeEmail: referee?.email || payload.refereeEmail || "",
    status: "pending",
    coach_id: actor.id,
    coachName: actor.full_name || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Seed the audit trail array on creation
    auditTrail: [{
      action: "created",
      by: actor.id,
      byName: actor.full_name || "Coach",
      byRole: actor.role,
      timestamp: new Date().toISOString(),
      details: { message: `Created appointment for ${referee?.full_name || 'unassigned referee'}` },
    }],
  });

  return { id: docRef.id, ...payload } as Appointment;
};

// ────────────────────────────────────────────────
// 🔄 UPDATE STATUS (accept / reject / etc.)
// Writes status + single audit entry atomically.
// ────────────────────────────────────────────────
export const updateAppointmentStatus = async (
  appointmentId: string,
  status: AppointmentStatus,
  actor: { id: string; role: string; full_name: string }
) => {
  // Step 1: update the status field
  await updateDoc(doc(db, "appointments", appointmentId), {
    status,
    updatedAt: serverTimestamp(),
  });

  // Step 2: append ONE audit entry for this action
  await appendAudit(appointmentId, status, actor, {
    message: `Status changed to ${status} by ${actor.full_name}`,
  });
};

// ────────────────────────────────────────────────
// 💬 SUBMIT FEEDBACK
// ────────────────────────────────────────────────
export const submitFeedback = async (
  appointmentId: string,
  feedback: string,
  actor: { id: string; role: UserRole; full_name?: string }
) => {
  await updateDoc(doc(db, "appointments", appointmentId), {
    feedback,
    updatedAt: serverTimestamp(),
  });

  await appendAudit(appointmentId, "feedback", actor, { feedback });
};

// ────────────────────────────────────────────────
// 📜 FETCH AUDIT TRAIL
// Reads from the auditTrail array field on the document.
// Sorted newest first.
// ────────────────────────────────────────────────
export const fetchAuditTrail = async (appointmentId: string): Promise<AuditLog[]> => {
  const snap = await getDoc(doc(db, "appointments", appointmentId));
  if (!snap.exists()) return [];

  const data = snap.data();
  const trail: AuditLog[] = data?.auditTrail || [];

  // Sort newest first
  return [...trail].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
};

// ────────────────────────────────────────────────
// 🔍 FETCH TEAM DATA
// ────────────────────────────────────────────────
export const fetchTeamData = async (teamId: string) => {
  const snap = await getDoc(doc(db, "teams", teamId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};