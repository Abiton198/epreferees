import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import DashboardHeader from './DashboardHeader';
import StatusBadge from './StatusBadge';
import CreateAppointmentDialog from './CreateAppointmentDialog';
import AuditTrailDrawer from './AuditTrailDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import type { Appointment, AppointmentStatus, Profile } from '@/types';
import {
  Plus, Search, ScrollText, Printer, Calendar,
  MapPin, Trophy, CheckCircle2, Clock, XCircle,
  Loader2, Pencil, Trash2, MessageSquareWarning, User,
  Eye, X, ShieldCheck
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { TeamRegistrationForm } from './TeamRegistrationForm';


const CoachDashboard: React.FC = () => {
  const { user } = useAuth() as any;

  // Data state
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [referees, setReferees] = useState<Record<string, Profile>>({});
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Scope state (executive committee members see ALL appointments)
  const [isExecutive, setIsExecutive] = useState<boolean | null>(null);

  // UI state
  const [createOpen, setCreateOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [execViewOpen, setExecViewOpen] = useState(false);

  // Edit state
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Reason modal state
  const [reasonAppt, setReasonAppt] = useState<Appointment | null>(null);

  // Team Registration
  const [teamRegistrationOpen, setTeamRegistrationOpen] = useState(false);


  // ── Real-time listeners ──────────────────────────────────────────────────

  // 1. Own profile — determines whether this coach is an executive
  //    committee member (isExecutive flag set via console/Admin SDK only).
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        setIsExecutive(snap.data()?.isExecutive === true);
      },
      (err) => {
        console.error("Profile listener error:", err);
        setIsExecutive(false); // fail closed to own-appointments scope
      }
    );

    return () => unsub();
  }, [user?.uid]);

  // 2. Appointments — waits until scope is known.
  //    Executives get the UNFILTERED collection; regular coaches only theirs.
  useEffect(() => {
    const uid = user?.uid;
    if (!uid || isExecutive === null) return;

    setLoading(true);

    const apptQuery = isExecutive
      ? query(
        collection(db, "appointments"),
        orderBy("createdAt", "desc")
      )
      : query(
        collection(db, "appointments"),
        where("coachId", "==", uid),
        orderBy("createdAt", "desc")
      );

    const unsubAppts = onSnapshot(
      apptQuery,
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
        setAppts(list);
        setLoading(false);
      },
      (err) => {
        console.error("Appointment listener error:", err);
        setLoading(false);
      }
    );

    return () => unsubAppts();
  }, [user?.uid, isExecutive]);

  // 3. Referees + Teams
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    // Referees (from 'users' collection)
    const unsubRefs = onSnapshot(
      query(collection(db, "users"), where("role", "==", "referee")),
      (snapshot) => {
        const map: Record<string, any> = {};
        snapshot.docs.forEach(d => {
          const data = d.data();
          map[d.id] = {
            ...data,
            id: d.id,
            // Map full_name to a standard property for the UI to read
            full_name: data.full_name || data.displayName || 'Unnamed Referee'
          };
        });
        setReferees(map);
      }
    );

    // Teams
    const unsubTeams = onSnapshot(collection(db, "teams"), (snapshot) => {
      setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubRefs();
      unsubTeams();
    };
  }, [user?.uid]);


  // ── Computed values ───────────────────────────────────────────────────────
  const visibleAppointments = useMemo(
    () => appts.filter((a: any) => !a.deleted),
    [appts]
  );

  const filtered = useMemo(() => visibleAppointments.filter((a) => {
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      a.homeTeam?.toLowerCase().includes(q) ||
      a.awayTeam?.toLowerCase().includes(q) ||
      a.venue?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  }), [visibleAppointments, search, statusFilter]);

  const stats = useMemo(() => ({
    total: appts.filter(a => !a.deleted).length,

    pending: appts.filter(
      a => a.status === 'pending' && !a.deleted
    ).length,

    accepted: appts.filter(
      a => a.status === 'accepted' && !a.deleted
    ).length,

    rejected: appts.filter(
      a => a.status === 'rejected' && !a.deleted
    ).length,

    cancelled: appts.filter(
      (a: any) => a.deleted
    ).length,

  }), [appts]);

  const venues = useMemo(() =>
    [...new Set(teams.map(t => t.homeGround))].filter(Boolean), [teams]);

  /**
   * Executive overview grouping:
   *  - current : match date in the current week (Mon–Sun) or in the future
   *  - lastWeek: match date within the previous week
   *  - older   : anything earlier (or with no parseable date)
   */
  const groupedAppointments = useMemo(() => {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7; // days elapsed since Monday
    const startOfThisWeek = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset
    );
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const current: Appointment[] = [];
    const lastWeek: Appointment[] = [];
    const older: Appointment[] = [];

    visibleAppointments.forEach((a) => {
      const d = a.matchDate ? new Date(`${a.matchDate}T00:00:00`) : null;
      const valid = d && !isNaN(d.getTime());

      if (valid && d! >= startOfThisWeek) {
        current.push(a);
      } else if (valid && d! >= startOfLastWeek) {
        lastWeek.push(a);
      } else {
        older.push(a);
      }
    });

    const byDateAsc = (x: Appointment, y: Appointment) =>
      (x.matchDate || '').localeCompare(y.matchDate || '');
    const byDateDesc = (x: Appointment, y: Appointment) =>
      (y.matchDate || '').localeCompare(x.matchDate || '');

    current.sort(byDateAsc);   // soonest fixtures first
    lastWeek.sort(byDateDesc); // most recent first
    older.sort(byDateDesc);

    return { current, lastWeek, older };
  }, [visibleAppointments]);


  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Resolve the name of the coach who created (appointed) this fixture. */
  const getAppointerName = (a: any): string =>
    a.coachName ||
    a.auditTrail?.find((e: any) => e.action === 'created')?.byName ||
    'Unknown';

  const getStatusTimestamp = (appt: any) => {
    if (!appt.auditTrail || appt.status === 'pending') return null;

    const entry = [...appt.auditTrail]
      .reverse()
      .find((e: any) => e.action === appt.status);

    if (!entry || !entry.timestamp) return null;

    const date = new Date(entry.timestamp);
    return date.toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };


  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteClick = (a: Appointment) => {
    setDeleteId(a.id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;

    setDeleteLoading(true);

    try {
      const appointment = appts.find(a => a.id === deleteId);

      if (!appointment) {
        throw new Error("Appointment not found");
      }

      await updateDoc(doc(db, "appointments", deleteId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || "coach",
        previousStatus: appointment.status,

        auditTrail: [
          ...(appointment.auditTrail || []),
          {
            action: "deleted",
            by: user?.uid || "unknown",
            byName:
              (appointment as any).coachName ||
              user?.displayName ||
              user?.email ||
              "Coach",
            byRole: "coach",
            timestamp: new Date().toISOString(),
            details: {
              previousStatus: appointment.status
            }
          }
        ]
      });

      toast({
        title: "Appointment removed",
        description: "The appointment was archived successfully.",
      });

      setDeleteId(null);

    } catch (error: any) {
      console.error("Delete error:", error);

      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────

  const openEditModal = (a: Appointment) => {
    if (a.status !== 'pending') {
      toast({
        title: "Cannot edit",
        description: "Only pending appointments can be edited.",
        variant: "destructive",
      });
      return;
    }
    setEditAppt(a);
    setEditDate(a.matchDate || '');
    setEditTime(a.matchTime || '');
    setEditVenue(a.venue || '');
    setEditNotes((a as any).notes || '');
  };

  const handleEditSave = async () => {
    if (!editAppt) return;
    setEditLoading(true);

    try {
      // 1. Ensure we have a valid reference
      const docRef = doc(db, "appointments", editAppt.id);

      // Resolve the appointer's display name reliably
      const resolveByName = (): string => {
        // 1. If the editor is the coach who owns this appointment, use the stored coachName
        if (user?.uid && user.uid === (editAppt as any).coachId && (editAppt as any).coachName) {
          return (editAppt as any).coachName;
        }
        // 2. Look up their name from a previous audit entry by the same uid
        const prevEntry = ((editAppt as any).auditTrail || []).find(
          (e: any) => e.by === user?.uid && e.byName
        );
        if (prevEntry) return prevEntry.byName;
        // 3. Fall back to Auth profile, then email
        return user?.displayName || user?.email || 'Coach';
      };

      // 2. Create a clean update object (avoiding undefined values)
      const updateData = {
        matchDate: editDate || "",
        matchTime: editTime || "",
        venue: editVenue || "",
        notes: editNotes || "",
        updatedAt: serverTimestamp(),

        // 3. Audit Trail Guard: Ensure user.uid and existing trail are valid
        auditTrail: [
          ...((editAppt as any).auditTrail || []),
          {
            action: 'edited',
            by: user?.uid || 'unknown_id',
            byName: resolveByName(),
            byRole: 'coach',
            timestamp: new Date().toISOString(),
            details: {
              date: editDate || "",
              time: editTime || "",
              venue: editVenue || "",
              notes: editNotes || "",
            },
          },
        ]
      };

      await updateDoc(docRef, updateData);

      toast({ title: "Appointment updated" });
      setEditAppt(null);
    } catch (err: any) {
      console.error("Firestore Update Error:", err);
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setEditLoading(false);
    }
  };


  // ── Sub-render: one appointment row inside the executive overview ────────
  const renderExecRow = (a: Appointment) => (
    <div
      key={a.id}
      className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm hover:border-emerald-200 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-800">
          {a.homeTeam}
          <span className="text-slate-400 font-normal mx-1 text-xs">vs</span>
          {a.awayTeam}
        </span>
        <StatusBadge status={a.status as AppointmentStatus} />
      </div>

      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-400" />
          {a.matchDate || 'TBC'}{a.matchTime ? ` @ ${a.matchTime}` : ''}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="w-3 h-3 text-slate-400" />
          {a.venue || 'Venue TBC'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 uppercase tracking-tighter bg-emerald-50 w-fit px-1.5 py-0.5 rounded">
          <Trophy className="w-3 h-3" />
          {(a as any).competition || 'League Match'}
        </div>

        <div className="text-[10px] text-slate-500 flex items-center gap-1">
          <User className="w-3 h-3 text-slate-400" />
          Appointed by:{' '}
          <span className="font-semibold text-slate-700">
            {getAppointerName(a)}
          </span>
        </div>

        {a.refereeId && (
          <div className="text-[10px] text-slate-500">
            Referee:{' '}
            <span className="font-semibold text-slate-700">
              {(a as any).refereeName ||
                referees[a.refereeId]?.full_name ||
                'Assigned Official'}
            </span>
          </div>
        )}
      </div>

      {a.status !== 'pending' && getStatusTimestamp(a) && (
        <div className="text-[10px] text-slate-400 italic mt-1">
          {a.status === 'accepted' ? 'Accepted' : 'Updated'} {getStatusTimestamp(a)}
        </div>
      )}
    </div>
  );

  const renderExecSection = (
    label: string,
    items: Appointment[],
    accent: string
  ) => (
    <div key={label}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[11px] font-black uppercase tracking-widest ${accent}`}>
          {label}
        </span>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          {items.length}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic mb-4">
          No appointments in this period.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {items.map(renderExecRow)}
        </div>
      )}
    </div>
  );


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Coach Dashboard</h1>
            <p className="text-gray-600 mt-1 italic">
              Logged in as <span className="font-bold text-[#006747]">
                {user?.displayName || user?.email || 'Coach'}
              </span>
              {isExecutive && (
                <span className="not-italic ml-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full align-middle">
                  <ShieldCheck className="w-3 h-3" />
                  Executive Committee
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            {isExecutive && (
              <Button
                variant="outline"
                onClick={() => setExecViewOpen(true)}
                className="shadow-sm border-emerald-200 text-emerald-800 hover:bg-emerald-50"
              >
                <Eye className="w-4 h-4 mr-2" /> All Appointments
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()} className="shadow-sm">
              <Printer className="w-4 h-4 mr-2" /> Report
            </Button>
            <Button onClick={() => setCreateOpen(true)}
              className="bg-[#006747] hover:bg-[#004d35] shadow-md transition-all active:scale-95">
              <Plus className="w-4 h-4 mr-2" /> New Appointment
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            {
              label: 'Total',
              value: stats.total,
              icon: Calendar,
              color: 'text-gray-700',
              bg: 'bg-gray-100'
            },

            {
              label: 'Pending',
              value: stats.pending,
              icon: Clock,
              color: 'text-amber-700',
              bg: 'bg-amber-100'
            },

            {
              label: 'Accepted',
              value: stats.accepted,
              icon: CheckCircle2,
              color: 'text-emerald-700',
              bg: 'bg-emerald-100'
            },

            {
              label: 'Rejected',
              value: stats.rejected,
              icon: XCircle,
              color: 'text-rose-700',
              bg: 'bg-rose-100'
            },

            {
              label: 'Cancelled',
              value: stats.cancelled,
              icon: Trash2,
              color: 'text-red-700',
              bg: 'bg-red-100'
            },

          ].map((s, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 font-bold">
                    {s.label}
                  </div>

                  <div className="text-3xl font-black text-gray-900 mt-1">
                    {s.value}
                  </div>
                </div>

                <div
                  className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}
                >
                  <s.icon className={`w-6 h-6 ${s.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-center shadow-sm print:hidden">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search teams or venues..."
              className="pl-10 bg-gray-50/50 border-gray-200 focus:bg-white" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 bg-gray-50/50">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>



        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="animate-spin text-[#006747] w-8 h-8" />
              <p className="text-sm text-gray-400 font-medium tracking-wide">Syncing match data...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-800">No appointments found</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                {search || statusFilter !== 'all'
                  ? "Adjust your filters to see more results."
                  : "Start by creating your first match appointment."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-200">
                  <tr className="text-left text-[11px] uppercase tracking-widest text-gray-500">
                    <th className="px-6 py-4 font-bold">Fixture</th>
                    <th className="px-6 py-4 font-bold">Venue</th>
                    <th className="px-6 py-4 font-bold">Date & Time</th>
                    <th className="px-6 py-4 font-bold">Referee</th>
                    <th className="px-6 py-4 font-bold text-center">Status</th>
                    <th className="px-6 py-4 font-bold text-right print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((a) => {
                    const isDeleted = (a as any).deleted;
                    const appointerName = getAppointerName(a);

                    return (
                      <tr
                        key={a.id}
                        className={`
                          group transition-colors
                          ${isDeleted
                            ? 'bg-red-50/30 opacity-45'
                            : 'hover:bg-emerald-50/30'}
                        `}
                      >
                        {/* Fixture */}
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 flex items-center gap-2">
                            <span className={isDeleted ? 'line-through' : ''}>
                              {a.homeTeam}
                              <span className="text-gray-400 font-normal mx-1 text-xs">vs</span>
                              {a.awayTeam}
                            </span>

                            {isDeleted && (
                              <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                Archived
                              </span>
                            )}
                          </div>

                          {/* Competition badge + Appointed by */}
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 uppercase tracking-tighter bg-emerald-50 w-fit px-1.5 py-0.5 rounded">
                              <Trophy className="w-3 h-3" />
                              {(a as any).competition || 'League Match'}
                            </div>

                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              Appointed by:{' '}
                              <span className="font-semibold text-slate-700">
                                {appointerName}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Venue */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                            <MapPin className="w-4 h-4 text-gray-300" />
                            <span className={isDeleted ? 'line-through' : ''}>
                              {a.venue}
                            </span>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <div className={`font-medium ${isDeleted ? 'line-through' : ''}`}>
                            {a.matchDate}
                          </div>

                          <div className="text-xs text-gray-400">
                            {a.matchTime}
                          </div>

                          {isDeleted && (
                            <div className="text-[10px] text-red-500 italic mt-1">
                              Archived for audit history
                            </div>
                          )}
                        </td>

                        {/* Referee */}
                        <td className="px-6 py-4 text-sm">
                          {a.refereeId ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-800">
                                {(a as any).refereeName ||
                                  referees[a.refereeId]?.full_name ||
                                  'Assigned Official'}
                              </span>

                              <span className="text-[10px] text-gray-400 uppercase tracking-tighter">
                                {a.officialRole || 'Referee'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-xs">
                              Awaiting Assignee
                            </span>
                          )}
                        </td>


                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {isDeleted ? (
                              <span className="px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-wide bg-red-100 text-red-700 border border-red-200">
                                Cancelled
                              </span>
                            ) : (
                              <StatusBadge status={a.status as AppointmentStatus} />
                            )}

                            {a.status !== 'pending' && (
                              <span className="text-[10px] text-gray-500 italic">
                                {getStatusTimestamp(a)}
                              </span>
                            )}

                            {!isDeleted && a.status === 'rejected' && (a as any).rejectionReason && (
                              <button
                                onClick={() => setReasonAppt(a)}
                                className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full hover:bg-red-100 transition-colors"
                              >
                                <MessageSquareWarning className="w-3 h-3" />
                                View Reason
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right print:hidden">
                          <div className="flex items-center justify-end gap-1">

                            {/* Hide edit/delete when archived */}
                            {!isDeleted && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditAppt(a);
                                    setCreateOpen(true);
                                  }}
                                  className={`hover:bg-white border border-transparent hover:border-gray-200
                                    ${a.status !== 'pending'
                                      ? 'opacity-30 cursor-not-allowed'
                                      : ''}`}
                                  title={
                                    a.status !== 'pending'
                                      ? 'Only pending can be edited'
                                      : 'Edit'
                                  }
                                >
                                  <Pencil className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteClick(a)}
                                  className="hover:bg-white border border-transparent hover:border-red-200"
                                  title="Archive appointment"
                                >
                                  <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
                                </Button>
                              </>
                            )}

                            {/* Audit Trail always visible */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setAuditId(a.id)}
                              className="hover:bg-white border border-transparent hover:border-gray-200"
                              title="View audit trail"
                            >
                              <ScrollText className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create dialog */}
      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);

          if (!open) {
            setEditAppt(null);
          }
        }}
        onCreated={() => {
          setCreateOpen(false);
          setEditAppt(null);
        }}
        editData={editAppt}
      />

      {/* Audit trail drawer */}
      <AuditTrailDrawer appointmentId={auditId} onClose={() => setAuditId(null)} />


      {/* ── Executive Overview Modal ── */}
      <Dialog open={execViewOpen} onOpenChange={setExecViewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="bg-emerald-100 p-2 rounded-full">
                    <ShieldCheck className="w-5 h-5 text-emerald-700" />
                  </span>
                  All Appointments
                </DialogTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Executive committee overview — every appointment across all coaches.
                </p>
              </div>

              <button
                onClick={() => setExecViewOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto pr-1 -mr-1 flex-1">
            {renderExecSection(
              'This Week & Upcoming',
              groupedAppointments.current,
              'text-emerald-700'
            )}
            {renderExecSection(
              'Last Week',
              groupedAppointments.lastWeek,
              'text-amber-700'
            )}
            {renderExecSection(
              'Older',
              groupedAppointments.older,
              'text-slate-500'
            )}
          </div>
        </DialogContent>
      </Dialog>


      {/* ── Edit Modal ── */}
      <Dialog open={!!editAppt && !createOpen} onOpenChange={v => !v && setEditAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-800">Edit Appointment</DialogTitle>
          </DialogHeader>
          {editAppt && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200">
                {editAppt.homeTeam} vs {editAppt.awayTeam}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Date</label>
                  <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                    className="border-slate-200 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Kick-off Time</label>
                  <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                    className="border-slate-200 focus:border-emerald-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Venue</label>
                <Input value={editVenue} onChange={e => setEditVenue(e.target.value)}
                  placeholder="Venue name" className="border-slate-200 focus:border-emerald-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                  placeholder="Any updates or instructions…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 resize-none" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditAppt(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editLoading}
              className="bg-[#006747] hover:bg-[#004d35]">
              {editLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Modal ── */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-600">Delete Appointment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            The appointment will be removed from the active list and archived in the audit history.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button onClick={handleConfirmDelete} disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white">
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Decline Reason Modal ── */}
      <Dialog open={!!reasonAppt} onOpenChange={(open) => !open && setReasonAppt(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="bg-red-100 p-2 rounded-full">
                <MessageSquareWarning className="w-5 h-5 text-red-600" />
              </span>
              Decline Reason
            </DialogTitle>
          </DialogHeader>

          {reasonAppt && (
            <div className="py-2 space-y-4">
              <div className="text-center pb-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fixture</p>
                <h4 className="text-lg font-black text-slate-900">
                  {reasonAppt.homeTeam} vs {reasonAppt.awayTeam}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {reasonAppt.matchDate} @ {reasonAppt.matchTime}
                </p>
              </div>

              <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                <p className="text-[10px] uppercase font-bold text-red-500 tracking-wider mb-1">
                  {reasonAppt.refereeName || 'Referee'}'s Reason
                </p>
                <p className="text-sm text-red-900 whitespace-pre-wrap">
                  {reasonAppt.rejectionReason}
                </p>
              </div>

              {reasonAppt.updatedAt && (
                <p className="text-[11px] text-slate-400 text-center italic">
                  Declined {getStatusTimestamp(reasonAppt)}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Team Registration */}
      <TeamRegistrationForm
        open={teamRegistrationOpen}
        onOpenChange={setTeamRegistrationOpen}
        onCreated={() => {
          setTeamRegistrationOpen(false);
        }}
      />

    </div>
  );
};

export default CoachDashboard;