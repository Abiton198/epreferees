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
  serverTimestamp
} from "firebase/firestore";

import type { Appointment, AppointmentStatus, AuditLog, Profile, UserRole } from "@/types";

// ────────────────────────────────────────────────
// 🔍 FETCH REFEREES FROM FIRESTORE
// ────────────────────────────────────────────────
export const fetchReferees = async (): Promise<Profile[]> => {
  const q = query(collection(db, "users"), where("role", "==", "referee"));
  const snap = await getDocs(q);

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Profile[];
};

// ────────────────────────────────────────────────
// 🔍 FETCH PROFILE BY ID
// ────────────────────────────────────────────────
export const fetchProfileById = async (id: string): Promise<Profile | null> => {
  const ref = doc(db, "users", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data(),
  } as Profile;
};

// ────────────────────────────────────────────────
// 📜 AUDIT LOG (SUBCOLLECTION STYLE)
// ────────────────────────────────────────────────
export const logAudit = async (
  appointmentId: string,
  actorId: string,
  actorRole: UserRole,
  action: string,
  details?: any
) => {
  await addDoc(collection(db, "appointments", appointmentId, "auditTrail"), {
    action,
    by: actorId,
    role: actorRole,
    details: details ?? "",
    timestamp: new Date().toISOString(),
  });
};

// ────────────────────────────────────────────────
// 📅 FETCH COACH APPOINTMENTS
// ────────────────────────────────────────────────
export const fetchCoachAppointments = async (coachId: string): Promise<Appointment[]> => {
  const q = query(
    collection(db, "appointments"),
    where("createdBy", "==", coachId),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Appointment[];
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

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Appointment[];
};

// ────────────────────────────────────────────────
// ➕ CREATE APPOINTMENT (WITH REF DATA)
// ────────────────────────────────────────────────
export const createAppointment = async (
  payload: any,
  actor: { id: string; role: UserRole; full_name?: string }
): Promise<Appointment> => {

  // 🔥 Fetch referee details from Firestore
  const referee = await fetchProfileById(payload.refereeId);

  const docRef = await addDoc(collection(db, "appointments"), {
    ...payload,

    referee: referee?.full_name || "",
    refereeEmail: referee?.email || "",

    status: "pending",

    createdBy: actor.id,
    appointedBy: actor.full_name || "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logAudit(docRef.id, actor.id, actor.role, "created", {
    message: `Created appointment for ${referee?.full_name}`,
  });

  return {
    id: docRef.id,
    ...payload,
  } as Appointment;
};

// ────────────────────────────────────────────────
// 🔄 UPDATE STATUS
// ────────────────────────────────────────────────
export const updateAppointmentStatus = async (
  appointmentId: string,
  status: AppointmentStatus,
  actor: { id: string; role: UserRole },
  feedback?: string
) => {

  const ref = doc(db, "appointments", appointmentId);

  await updateDoc(ref, {
    status,
    feedback: feedback || "",
    updatedAt: serverTimestamp(),
  });

  await logAudit(appointmentId, actor.id, actor.role, status, {
    feedback,
  });
};

// ────────────────────────────────────────────────
// 💬 SUBMIT FEEDBACK
// ────────────────────────────────────────────────
export const submitFeedback = async (
  appointmentId: string,
  feedback: string,
  actor: { id: string; role: UserRole }
) => {

  const ref = doc(db, "appointments", appointmentId);

  await updateDoc(ref, {
    feedback,
    updatedAt: serverTimestamp(),
  });

  await logAudit(appointmentId, actor.id, actor.role, "feedback", {
    feedback,
  });
};

// ────────────────────────────────────────────────
// 📜 FETCH AUDIT TRAIL
// ────────────────────────────────────────────────
export const fetchAuditTrail = async (appointmentId: string): Promise<AuditLog[]> => {

  const q = query(
    collection(db, "appointments", appointmentId, "auditTrail"),
    orderBy("timestamp", "desc")
  );

  const snap = await getDocs(q);

  return snap.docs.map(doc => doc.data()) as AuditLog[];
};

// ────────────────────────────────────────────────
// 🔍 FETCH TEAM DATA
// ────────────────────────────────────────────────
export const fetchTeamData = async (teamId: string): Promise<Team | null> => {
  const ref = doc(db, "teams", teamId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data(),
  } as Team;
};