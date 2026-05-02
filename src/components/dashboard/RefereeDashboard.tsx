
import React, { useEffect, useMemo, useState } from 'react';
import DashboardHeader from './DashboardHeader';
import StatusBadge from './StatusBadge';
import AuditTrailDrawer from './AuditTrailDrawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { updateAppointmentStatus, submitFeedback } from '@/services/appointments';
import { toast } from '@/components/ui/use-toast';
import type { Appointment, AppointmentStatus, AuditLog } from '@/types';
import { Calendar, MapPin, Trophy, Check, X, MessageSquare, Loader2, Clock, ScrollText, History } from 'lucide-react';

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const RefereeDashboard: React.FC = () => {
  const { profile } = useAuth();

  const [appts, setAppts] = useState<Appointment[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);

  const [feedbackTarget, setFeedbackTarget] = useState<Appointment | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFb, setSubmittingFb] = useState(false);

  // 🔔 NEW APPOINTMENT POPUP STATE
  const [newAppt, setNewAppt] = useState<Appointment | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  // 🧠 Ensure profile exists
  const ensureUserProfile = async () => {
    if (!profile) return;

    const ref = doc(db, "users", profile.id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        full_name: profile.full_name || "",
        email: profile.email || "",
        role: profile.role || "referee",
        createdAt: new Date().toISOString(),
      });
    }
  };

  // ⚡ REAL-TIME LISTENERS
  useEffect(() => {
    if (!profile?.id) return;

    let unsubAppts: any;
    let unsubHistory: any;

    const init = async () => {
      setLoading(true);
      await ensureUserProfile();

      const apptQuery = query(
        collection(db, "appointments"),
        where("refereeId", "==", profile.id),
        orderBy("createdAt", "desc")
      );

      unsubAppts = onSnapshot(apptQuery, (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Appointment[];

        setAppts(list);
        setLoading(false);

        // 🔔 Detect NEW appointments
        list.forEach((a) => {
          if (!seenIds.has(a.id) && a.status === "pending") {
            setNewAppt(a);
            setSeenIds((prev) => new Set(prev).add(a.id));
          }
        });
      });

      const historyQuery = query(
        collection(db, "auditTrail"),
        where("actor_id", "==", profile.id),
        orderBy("created_at", "desc")
      );

      unsubHistory = onSnapshot(historyQuery, (snap) => {
        const logs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as AuditLog[];

        setHistory(logs);
      });
    };

    init();

    return () => {
      if (unsubAppts) unsubAppts();
      if (unsubHistory) unsubHistory();
    };
  }, [profile?.id]);

  // ⚡ ACTIONS
  const handleAction = async (appt: Appointment, status: AppointmentStatus) => {
    if (!profile) return;
    setActing(appt.id);

    try {
      await updateAppointmentStatus(appt.id, status, {
        id: profile.id,
        role: profile.role,
        full_name: profile.full_name,
      });

      toast({ title: `Appointment ${status}`, description: appt.match_title });
      setNewAppt(null);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const handleFeedback = async () => {
    if (!profile || !feedbackTarget) return;
    setSubmittingFb(true);

    try {
      await submitFeedback(feedbackTarget.id, feedbackText, {
        id: profile.id,
        role: profile.role,
      });

      toast({ title: "Feedback submitted" });
      setFeedbackTarget(null);
      setFeedbackText("");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingFb(false);
    }
  };

  const stats = useMemo(() => ({
    pending: appts.filter((a) => a.status === 'pending').length,
    accepted: appts.filter((a) => a.status === 'accepted').length,
    total: appts.length,
  }), [appts]);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      {/* 🔔 NEW APPOINTMENT MODAL */}
      <Dialog open={!!newAppt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Match Assignment</DialogTitle>
          </DialogHeader>

          {newAppt && (
            <div className="space-y-3 text-sm">
              <div><strong>{newAppt.match_title}</strong></div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {new Date(newAppt.match_date).toLocaleString()}
              </div>

              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {newAppt.venue}
              </div>

              {newAppt.competition && (
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  {newAppt.competition}
                </div>
              )}

              {newAppt.notes && (
                <div className="bg-gray-50 p-2 rounded border">
                  {newAppt.notes}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleAction(newAppt!, "rejected")}
              className="border-rose-300 text-rose-700"
            >
              Reject
            </Button>

            <Button
              onClick={() => handleAction(newAppt!, "accepted")}
              className="bg-emerald-600"
            >
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MAIN CONTENT (unchanged UI below) */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <h1 className="text-3xl font-black text-gray-900">Referee Dashboard</h1>

        <div className="grid grid-cols-3 gap-4 mt-6 mb-8">
          <div className="bg-white p-4 rounded">{stats.total} Total</div>
          <div className="bg-white p-4 rounded">{stats.pending} Pending</div>
          <div className="bg-white p-4 rounded">{stats.accepted} Accepted</div>
        </div>
      </main>

      <AuditTrailDrawer appointmentId={auditId} onClose={() => setAuditId(null)} />
    </div>
  );
};

export default RefereeDashboard;

