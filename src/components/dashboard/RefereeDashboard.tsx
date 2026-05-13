import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from '@/contexts/AuthContext';
import { updateAppointmentStatus } from '@/services/appointments';
import { toast } from '@/components/ui/use-toast';

// UI Components
import DashboardHeader from './DashboardHeader';
import StatusBadge from './StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Calendar,
  MapPin,
  Trophy,
  Check,
  X,
  Loader2,
  Clock,
  UserCheck,
  ChevronRight,
  Info
} from 'lucide-react';

// Types
import type { Appointment, AppointmentStatus } from '@/types';

const RefereeDashboard: React.FC = () => {
  const { user } = useAuth();
  const role = "referee";


  // State
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState<boolean>(false);
  const [acting, setActing] = useState<string | null>(null);

  // New Appointment Popup Logic
  const [newAppt, setNewAppt] = useState<Appointment | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());


  // Helper — merges two appointment arrays, deduplicates by id, sorts by createdAt
  const mergeAppointments = (a: Appointment[], b: Appointment[]): Appointment[] => {
    const map = new Map<string, Appointment>();
    [...a, ...b].forEach(appt => map.set(appt.id, appt));
    return Array.from(map.values()).sort((x, y) => {
      const ts = (a: Appointment) => a.createdAt?.seconds ?? 0;
      return ts(y) - ts(x);
    });
  };

  /**
   * 1. SYNC USER PROFILE
   * Checks if user exists in Firestore, creates them if not, 
   * and identifies if they should see the "New User" welcome screen.
   */
  const syncProfile = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,                         // Added UID field
          full_name: user.displayName || "Referee",
          email: user.email || "",
          role: "referee",
          isNewUser: true,
          status: "active",
          approved: true,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        });
        setIsNewUser(true);
      } else {
        const data = snap.data();
        // Update local state based on the field 'isNewUser' from your list
        setIsNewUser(data.isNewUser ?? false);
        await updateDoc(userRef, { lastLogin: serverTimestamp() });
      }
    } catch (error) {
      console.error("Error syncing profile:", error);
    }
  };

  /**
   * 2. REAL-TIME DATA LISTENER
   */
  useEffect(() => {
    if (!user?.uid) return;

    const unsubs: (() => void)[] = [];
    let listById: Appointment[] = [];
    let listByName: Appointment[] = [];
    let listByEmail: Appointment[] = [];

    const handleMerge = () => {
      const merged = mergeAppointments(
        mergeAppointments(listById, listByName),
        listByEmail
      );

      setAppts(merged);

      merged.forEach(a => {
        if (!seenIds.has(a.id) && a.status === 'pending') {
          setNewAppt(a);
          setSeenIds(prev => new Set(prev).add(a.id));
        }
      });
    };

    const init = async () => {
      setLoading(true);
      await syncProfile();

      try {
        // ── Query 1: by refereeId (UID) — primary ──────────────────────────
        // Requires index: refereeId ASC + createdAt DESC
        const q1 = query(
          collection(db, "appointments"),
          where("refereeId", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        // ── Query 2: by refereeName — fallback (survives UID changes) ──────
        // Requires index: refereeName ASC + createdAt DESC
        const q2 = query(
          collection(db, "appointments"),
          where("refereeName", "==", user.displayName ?? ""),
          orderBy("createdAt", "desc")
        );

        const q3 = query(
          collection(db, "appointments"),
          where("refereeEmail", "==", user.email ?? ""),
          orderBy("createdAt", "desc")
        );

        let q1Ready = false;
        let q2Ready = false;
        let q3Ready = false;

        const unsub1 = onSnapshot(q1,
          (snap) => {
            listById = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
            q1Ready = true;
            if (q1Ready && q2Ready && q3Ready) { setLoading(false); }
            handleMerge();
          },
          (error) => {
            console.error("❌ Query-by-ID error:", error.code, error.message);
            q1Ready = true;
            if (q1Ready && q2Ready) setLoading(false);
            toast({ title: "Error (ID query)", description: error.message, variant: "destructive" });
          }
        );

        const unsub2 = onSnapshot(q2,
          (snap) => {
            listByName = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
            q2Ready = true;
            if (q1Ready && q2Ready) { setLoading(false); }
            handleMerge();
          },
          (error) => {
            console.error("❌ Query-by-name error:", error.code, error.message);
            q2Ready = true;
            if (q1Ready && q2Ready) setLoading(false);
            // Name query failing is non-fatal — silently continue
          }
        );

        const unsub3 = onSnapshot(q3,
          (snap) => {
            listByEmail = snap.docs.map(d => ({
              id: d.id,
              ...d.data()
            })) as Appointment[];

            q3Ready = true;

            handleMerge();
          },
          (error) => {
            console.error("❌ Query-by-email error:", error);
          }
        );

        unsubs.push(unsub1, unsub2, unsub3);
      } catch (err: any) {
        console.error("❌ Init error:", err);
        setLoading(false);
      }
    };

    init();
    return () => unsubs.forEach(fn => fn());
  }, [user?.uid]);

  console.log("CURRENT USER");
  console.log(user?.uid);
  console.log(user?.email);
  console.log(user?.displayName);

  /**
   * 3. ACTIONS
   */
  const handleUpdateStatus = async (appt: Appointment, newStatus: 'accepted' | 'rejected') => {
    setActing(appt.id);
    try {
      const docRef = doc(db, "appointments", appt.id);

      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        refereeId: user?.uid,          // ← backfills correct UID
        refereeEmail: user?.email,     // ← backfills correct email
        auditTrail: [
          ...(appt.auditTrail || []),
          {
            action: newStatus,
            by: user?.uid,
            byName: user?.displayName || 'Referee',
            timestamp: new Date().toISOString(),
          }
        ]
      });

      // Custom Toast for Acceptance
      if (newStatus === 'accepted') {
        toast({
          title: "Match Accepted!",
          description: "Get ready to be at the venue at least 1hr before the match, enjoy the game and fairplay",
          className: "bg-emerald-50 border-emerald-200 text-emerald-900",
        });
      } else {
        toast({
          title: "Match Declined",
          description: "The appointment has been removed from your pending list.",
        });
      }

    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActing(null); // This clears the loading state and effectively "closes" the action UI
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), { isNewUser: false });
    setIsNewUser(false);
  };

  // 4. MEMOIZED STATS
  const stats = useMemo(() => ({
    pending: appts.filter(a => a.status === 'pending').length,
    accepted: appts.filter(a => a.status === 'accepted').length,
    total: appts.length,
  }), [appts]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-emerald-600 w-12 h-12 mb-4" />
        <p className="text-gray-500 font-medium">Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-10">

        {isNewUser ? (
          /* --- CUSTOMIZED VIEW: NEW USER --- */
          <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="bg-emerald-600 p-8 text-white">
              <h1 className="text-3xl font-bold">Welcome, {user?.displayName?.split(' ')[0]}!</h1>
              <p className="mt-2 opacity-90 text-lg">Your referee profile is now active and ready for assignments.</p>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="flex gap-4 p-4 rounded-xl bg-gray-50">
                  <div className="bg-emerald-100 p-3 rounded-lg h-fit"><Clock className="text-emerald-700" /></div>
                  <div>
                    <h3 className="font-bold text-gray-800">Pending Requests</h3>
                    <p className="text-sm text-gray-500">New match assignments will appear here instantly.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-4 rounded-xl bg-gray-50">
                  <div className="bg-blue-100 p-3 rounded-lg h-fit"><UserCheck className="text-blue-700" /></div>
                  <div>
                    <h3 className="font-bold text-gray-800">Direct Contact</h3>
                    <p className="text-sm text-gray-500">Coaches and Admins can now assign you to matches via your email.</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg flex gap-3">
                <Info className="text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800 italic">
                  Tip: Keep your dashboard open on Saturdays to receive and accept last-minute match changes.
                </p>
              </div>

              <Button onClick={handleCompleteOnboarding} className="w-full py-6 text-lg bg-emerald-600 hover:bg-emerald-700">
                Enter Dashboard <ChevronRight className="ml-2" />
              </Button>
            </div>
          </div>
        ) : (
          /* --- CUSTOMIZED VIEW: RETURNING USER --- */
          <>
            <div className="mb-10">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Referee Dashboard</h1>
              <p className="text-slate-500 mt-1">Manage your match assignments and schedule.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <StatCard label="Total Assignments" value={stats.total} icon={<Trophy className="w-5 h-5" />} color="blue" />
              <StatCard label="Action Required" value={stats.pending} icon={<Clock className="w-5 h-5" />} color="amber" />
              <StatCard label="Upcoming Confirmed" value={stats.accepted} icon={<Check className="w-5 h-5" />} color="emerald" />
            </div>

            {/* List Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h2 className="font-bold text-slate-800 uppercase tracking-wider text-sm">Recent Appointments</h2>
              </div>

              {appts.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="text-slate-300 w-10 h-10" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">No matches yet</h3>
                  <p className="text-slate-500">When you are assigned to a match, it will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {appts.map((appt) => (
                    <div key={appt.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg text-slate-900">
                            {appt.homeTeam} vs {appt.awayTeam}
                          </span>
                          <StatusBadge status={appt.status} />

                          <div className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide">
                            {appt.officialRole || "Referee"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500 mt-2">
                          <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {appt.matchDate} @ {appt.matchTime}</div>
                          <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {appt.venue}</div>
                          <div className="flex items-center gap-1.5 font-medium text-emerald-600 uppercase text-xs tracking-tight bg-emerald-50 px-2 rounded">
                            {appt.competition}
                          </div>
                        </div>
                      </div>

                      {appt.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            disabled={!!acting}
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateStatus(appt, 'rejected')}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <X className="w-4 h-4 mr-1" /> Decline
                          </Button>
                          <Button
                            disabled={!!acting}
                            size="sm"
                            onClick={() => handleUpdateStatus(appt, 'accepted')}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Check className="w-4 h-4 mr-1" /> Accept
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* --- NOTIFICATION DIALOG FOR NEW ASSIGNMENTS --- */}
      <Dialog open={!!newAppt} onOpenChange={(open) => !open && setNewAppt(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span className="bg-emerald-100 p-2 rounded-full"><Trophy className="w-5 h-5 text-emerald-600" /></span>
              New Match Assignment
            </DialogTitle>
          </DialogHeader>

          {newAppt && (
            <div className="py-4 space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-center mb-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Matchup</p>
                  <h4 className="text-xl font-black text-slate-900">{newAppt.homeTeam} vs {newAppt.awayTeam}</h4>
                </div>

                {/* OFFICIAL ROLE */}
                <div className="flex items-center gap-1.5 font-medium text-indigo-700 uppercase text-xs tracking-tight bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100">
                  <UserCheck className="w-3.5 h-3.5" />
                  {newAppt.officialRole || "Referee"}
                </div>

                <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Date:</span>
                    <span className="font-semibold text-slate-900">{newAppt.matchDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Kick-off:</span>
                    <span className="font-semibold text-slate-900">{newAppt.matchTime}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Venue:</span>
                    <span className="font-semibold text-slate-900">{newAppt.venue}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="grid grid-cols-2 gap-3 sm:justify-start">
            <Button
              variant="outline"
              disabled={!!acting}
              onClick={() => handleUpdateStatus(newAppt!, "rejected")}
              className="w-full"
            >
              Decline
            </Button>
            <Button
              disabled={!!acting}
              onClick={() => handleUpdateStatus(newAppt!, "accepted")}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {acting === newAppt?.id ? <Loader2 className="animate-spin" /> : "Accept Match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/**
 * Helper Sub-component for Stats
 */
const StatCard = ({ label, value, icon, color }: { label: string, value: number, icon: React.ReactNode, color: 'blue' | 'amber' | 'emerald' }) => {
  const colors = {
    blue: "border-l-blue-500 text-blue-600 bg-blue-50",
    amber: "border-l-amber-500 text-amber-600 bg-amber-50",
    emerald: "border-l-emerald-500 text-emerald-600 bg-emerald-50",
  };

  return (
    <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 border-l-4 ${colors[color]}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">{label}</span>
        <div className="opacity-80">{icon}</div>
      </div>
      <div className="text-3xl font-black text-slate-900">{value}</div>
    </div>
  );
};

export default RefereeDashboard;