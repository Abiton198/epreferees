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
import { RefereeMatchSummaries } from './RefereeMatchSummaries';

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

  // Referee match summaries
  const [refereeSummaryOpen, setRefereeSummaryOpen] = useState(false);
  const [editRefereeId, setEditRefereeId] = useState('');

  // ── Real-time listeners ──────────────────────────────────────────────────

  // 1. Own profile — determines whether this coach is an executive committee member
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
        setIsExecutive(false);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  // 2. Appointments — waits until scope is known.
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

    const unsubRefs = onSnapshot(
      query(collection(db, "users"), where("role", "==", "referee")),
      (snapshot) => {
        const map: Record<string, any> = {};
        snapshot.docs.forEach(d => {
          const data = d.data();
          map[d.id] = {
            ...data,
            id: d.id,
            full_name: data.full_name || data.displayName || 'Unnamed Referee'
          };
        });
        setReferees(map);
      }
    );

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
      a => (a.status === 'pending' || a.status === 'pending_assignment') && !a.deleted
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

  const groupedAppointments = useMemo(() => {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
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

    const getDateTimeString = (a: Appointment) => {
      const date = a.matchDate || '';
      const time = a.matchTime || '00:00';
      return `${date}T${time}`;
    };

    const byDateTimeDesc = (x: Appointment, y: Appointment) =>
      getDateTimeString(y).localeCompare(getDateTimeString(x));

    current.sort(byDateTimeDesc);
    lastWeek.sort(byDateTimeDesc);
    older.sort(byDateTimeDesc);

    return { current, lastWeek, older };
  }, [visibleAppointments]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getAppointerName = (_a?: any): string => 'Appointment Committee';

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
      if (!appointment) throw new Error("Appointment not found");

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
    if (a.status !== 'pending' && a.status !== 'pending_assignment') {
      toast({
        title: "Cannot edit",
        description: "Only pending appointments can be edited.",
        variant: "destructive",
      });
      return;
    }

    setEditAppt(a);
    setEditNotes(a.notes || '');
    setEditDate(a.matchDate || '');
    setEditTime(a.matchTime || '');
    setEditVenue(a.venue || '');
    setEditRefereeId(a.refereeId || ''); // <-- Set initial referee ID
  };

  const handleEditSave = async () => {
    if (!editAppt) return;
    setEditLoading(true);

    try {
      const docRef = doc(db, "appointments", editAppt.id);

      const effectiveRefereeId =
        editRefereeId && editRefereeId !== "unassigned" ? editRefereeId : null;

      const newStatus = effectiveRefereeId ? "pending" : "pending_assignment";
      const selectedReferee = effectiveRefereeId ? referees[effectiveRefereeId] : null;
      const refereeName = selectedReferee?.full_name || "";
      const refereeEmail = selectedReferee?.email || "";

      // Track if a new referee was assigned or swapped
      const isNewlyAssigned = Boolean(
        effectiveRefereeId && effectiveRefereeId !== editAppt.refereeId
      );

      const updateData: Record<string, any> = {
        matchDate: editDate || "",
        matchTime: editTime || "",
        venue: editVenue || "",
        notes: editNotes || "",
        date: editDate || "",
        time: editTime || "",
        refereeId: effectiveRefereeId,
        refereeName: refereeName,
        refereeEmail: refereeEmail,
        status: newStatus,
        updatedAt: serverTimestamp(),
        auditTrail: [
          ...((editAppt as any).auditTrail || []),
          {
            action: isNewlyAssigned ? "assigned_referee" : "edited",
            by: user?.uid || "unknown_id",
            byName: user?.displayName || user?.email || "Coach",
            byRole: "coach",
            timestamp: new Date().toISOString(),
            details: {
              oldDate: (editAppt as any).matchDate || "",
              newDate: editDate || "",
              oldTime: (editAppt as any).matchTime || "",
              newTime: editTime || "",
              oldVenue: (editAppt as any).venue || "",
              newVenue: editVenue || "",
              oldRefereeId: editAppt.refereeId || "",
              newRefereeId: effectiveRefereeId || "",
              statusKept: newStatus,
            },
          },
        ],
      };

      // Save to Firestore — triggers onAppointmentUpdated in Cloud Functions automatically
      await updateDoc(docRef, updateData);

      toast({
        title: effectiveRefereeId ? "Referee Assigned" : "Fixture Updated",
        description: effectiveRefereeId
          ? "Referee has been assigned. Email notification dispatched automatically."
          : "Fixture details saved.",
      });

      setEditAppt(null);
    } catch (err: any) {
      console.error("Firestore Update Error:", err);
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setEditLoading(false);
    }
  };

  // ── Executive Row Renderers ───────────────────────────────────────────────
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

  // ── Render Main Component ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full mb-6">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight">
              Coach Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 italic flex flex-wrap items-center gap-1.5">
              <span>Logged in as</span>
              <span className="font-bold text-[#006747]">
                {user?.displayName || user?.email || 'Coach'}
              </span>
              {isExecutive && (
                <span className="not-italic inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  Executive
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto print:hidden">
            {isExecutive && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setRefereeSummaryOpen(true)}
                  className="w-full sm:w-auto justify-center text-xs sm:text-sm shadow-sm border-emerald-200 text-emerald-800 hover:bg-emerald-50 bg-emerald-50/50 h-10 px-3 sm:px-4"
                >
                  <ScrollText className="w-4 h-4 mr-1.5 sm:mr-2 text-emerald-600 shrink-0" />
                  <span className="truncate">Referee Summaries</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setExecViewOpen(true)}
                  className="w-full sm:w-auto justify-center text-xs sm:text-sm shadow-sm border-emerald-200 text-emerald-800 hover:bg-emerald-50 h-10 px-3 sm:px-4"
                >
                  <Eye className="w-4 h-4 mr-1.5 sm:mr-2 shrink-0" />
                  <span className="truncate">All Appointments</span>
                </Button>
              </>
            )}

            <Button
              variant="outline"
              onClick={() => window.print()}
              className="w-full sm:w-auto justify-center text-xs sm:text-sm shadow-sm border-gray-200 h-10 px-3 sm:px-4"
            >
              <Printer className="w-4 h-4 mr-1.5 sm:mr-2 text-gray-500 shrink-0" />
              <span className="truncate">Report</span>
            </Button>

            <Button
              onClick={() => setCreateOpen(true)}
              className="col-span-2 sm:col-span-1 w-full sm:w-auto justify-center text-xs sm:text-sm bg-[#006747] hover:bg-[#004d35] text-white font-bold shadow-md transition-all active:scale-95 h-10 px-4"
            >
              <Plus className="w-4 h-4 mr-1.5 sm:mr-2 shrink-0" />
              <span>New Appointment</span>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, icon: Calendar, color: 'text-gray-700', bg: 'bg-gray-100' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-100' },
            { label: 'Accepted', value: stats.accepted, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100' },
            { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-rose-700', bg: 'bg-rose-100' },
            { label: 'Cancelled', value: stats.cancelled, icon: Trash2, color: 'text-red-700', bg: 'bg-red-100' },
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
                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}>
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
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teams or venues..."
              className="pl-10 bg-gray-50/50 border-gray-200 focus:bg-white"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 bg-gray-50/50">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="pending_assignment">Pending Assignment</SelectItem>
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
                    const canEdit = a.status === 'pending' || a.status === 'pending_assignment';

                    return (
                      <tr
                        key={a.id}
                        className={`group transition-colors ${isDeleted ? 'bg-red-50/30 opacity-45' : 'hover:bg-emerald-50/30'
                          }`}
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

                        {/* Date & Time */}
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
                          <StatusBadge status={a.status as AppointmentStatus} />
                          {a.status === 'rejected' && (a as any).rejectionReason && (
                            <button
                              onClick={() => setReasonAppt(a)}
                              className="mt-1 text-[11px] text-rose-600 hover:text-rose-800 flex items-center justify-center gap-1 mx-auto font-medium"
                            >
                              <MessageSquareWarning className="w-3 h-3" />
                              View Reason
                            </button>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right print:hidden">
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && !isDeleted && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(a)}
                                title="Edit Fixture"
                                className="h-8 w-8 p-0 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAuditId(a.id)}
                              title="Audit Trail"
                              className="h-8 w-8 p-0 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                            >
                              <ScrollText className="w-4 h-4" />
                            </Button>

                            {!isDeleted && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(a)}
                                title="Remove Appointment"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
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

      {/* ── Dialogs & Drawers ────────────────────────────────────────────────── */}

      {/* Create Appointment */}
      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Audit Trail Drawer */}
      {auditId && (
        <AuditTrailDrawer
          appointmentId={auditId}
          open={!!auditId}
          onClose={() => setAuditId(null)}
        />
      )}

      {/* Edit Appointment Modal */}
      <Dialog open={!!editAppt} onOpenChange={(open) => !open && setEditAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Fixture Details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                Assign Referee
              </label>
              <Select
                value={editRefereeId || "unassigned"}
                onValueChange={(val) => setEditRefereeId(val === "unassigned" ? "" : val)}
              >
                <SelectTrigger className="w-full bg-white border-gray-200">
                  <SelectValue placeholder="Select a referee..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {Object.values(referees)
                    .filter((ref) => Boolean(ref.id)) // Guard against empty IDs
                    .map((ref) => (
                      <SelectItem key={ref.id} value={ref.id}>
                        {ref.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                Match Date
              </label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                Match Time
              </label>
              <Input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                Venue
              </label>
              <Input
                type="text"
                value={editVenue}
                onChange={(e) => setEditVenue(e.target.value)}
                placeholder="Match venue"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                Notes / Instructions
              </label>
              <Input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Additional notes"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setEditAppt(null)}
              disabled={editLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={editLoading}
              className="bg-[#006747] hover:bg-[#004d35] text-white"
            >
              {editLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Remove Appointment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to remove this appointment? It will be archived in the system for record-keeping and audit purposes.
          </p>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Modal */}
      <Dialog open={!!reasonAppt} onOpenChange={(open) => !open && setReasonAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <MessageSquareWarning className="w-5 h-5" />
              Rejection Reason
            </DialogTitle>
          </DialogHeader>
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-900 mt-2">
            {(reasonAppt as any)?.rejectionReason || "No specific reason provided."}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setReasonAppt(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Executive Overview Drawer / Dialog */}
      <Dialog open={execViewOpen} onOpenChange={setExecViewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              Executive Appointments View
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-1 space-y-6 my-4">
            {renderExecSection("Current / Upcoming Fixtures", groupedAppointments.current, "text-emerald-700")}
            {renderExecSection("Last Week's Fixtures", groupedAppointments.lastWeek, "text-amber-700")}
            {renderExecSection("Older Fixtures", groupedAppointments.older, "text-slate-500")}
          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setExecViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Referee Summaries Modal */}
      <Dialog open={refereeSummaryOpen} onOpenChange={setRefereeSummaryOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Referee Match Summaries</DialogTitle>
          </DialogHeader>
          <RefereeMatchSummaries />
        </DialogContent>
      </Dialog>

      {/* Team Registration Modal */}
      <Dialog open={teamRegistrationOpen} onOpenChange={setTeamRegistrationOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Team Registration</DialogTitle>
          </DialogHeader>
          <TeamRegistrationForm onSuccess={() => setTeamRegistrationOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoachDashboard;