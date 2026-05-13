import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, onSnapshot,
  orderBy, deleteDoc, updateDoc, doc, serverTimestamp
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
  Loader2, Pencil, Trash2
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const CoachDashboard: React.FC = () => {
  const { user } = useAuth() as any;

  // Data state
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [referees, setReferees] = useState<Record<string, Profile>>({});
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [createOpen, setCreateOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  // ── Real-time listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    setLoading(true);

    // 1. Appointments Query (Using camelCase coachId)
    const apptQuery = query(
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

    // 2. Updated Referees Listener (Now fetching from 'users' collection)
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

    // 3. Teams Listener
    const unsubTeams = onSnapshot(collection(db, "teams"), (snapshot) => {
      setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubAppts();
      unsubRefs();
      unsubTeams();
    };
  }, [user?.uid]);


  // ── Computed values ───────────────────────────────────────────────────────

  const filtered = useMemo(() => appts.filter((a) => {
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      a.homeTeam?.toLowerCase().includes(q) ||
      a.awayTeam?.toLowerCase().includes(q) ||
      a.venue?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  }), [appts, search, statusFilter]);

  const stats = useMemo(() => ({
    total: appts.length,
    pending: appts.filter(a => a.status === 'pending').length,
    accepted: appts.filter(a => a.status === 'accepted').length,
    rejected: appts.filter(a => a.status === 'rejected').length,
  }), [appts]);

  const venues = useMemo(() =>
    [...new Set(teams.map(t => t.homeGround))].filter(Boolean), [teams]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await deleteDoc(doc(db, "appointments", deleteId));
      toast({ title: "Appointment deleted" });
      setDeleteId(null);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteClick = (a: Appointment) => {
    if (a.status !== 'pending') {
      toast({
        title: "Cannot delete",
        description: "Only pending appointments can be deleted.",
        variant: "destructive",
      });
      return;
    }
    setDeleteId(a.id);
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
            by: user?.uid || 'unknown_id', // Fallback for ID
            byName: user?.displayName || user?.email || 'Coach',
            byRole: 'coach',
            timestamp: new Date().toISOString(),
            details: {
              date: editDate || "",
              time: editTime || "",
              venue: editVenue || "",
              notes: editNotes || ""
            },
          }
        ]
      };

      await updateDoc(docRef, updateData);

      toast({ title: "Appointment updated" });
      setEditAppt(null);
    } catch (err: any) {
      console.error("Firestore Update Error:", err); // Log the full error to see exactly which field failed
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setEditLoading(false);
    }
  };


  const getStatusTimestamp = (appt: any) => {
    console.log('auditTrail for', appt.id, appt.auditTrail);

    if (!appt.auditTrail || appt.status === 'pending') return null;

    const entry = [...appt.auditTrail]
      .reverse()
      .find(e => e.action === appt.status);

    console.log('matched entry:', entry);

    if (!entry || !entry.timestamp) return null;

    const date = new Date(entry.timestamp);
    return date.toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



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
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, icon: Calendar, color: 'text-gray-700', bg: 'bg-gray-100' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-100' },
            { label: 'Accepted', value: stats.accepted, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100' },
            { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-rose-700', bg: 'bg-rose-100' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm transition-transform hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 font-bold">{s.label}</div>
                  <div className="text-3xl font-black text-gray-900 mt-1">{s.value}</div>
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
                  {filtered.map((a) => (
                    <tr key={a.id} className="group hover:bg-emerald-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">
                          {a.homeTeam}
                          <span className="text-gray-400 font-normal mx-1 text-xs">vs</span>
                          {a.awayTeam}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 mt-1 uppercase tracking-tighter bg-emerald-50 w-fit px-1.5 rounded">
                          <Trophy className="w-3 h-3" /> {(a as any).competition || 'League Match'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                          <MapPin className="w-4 h-4 text-gray-300" /> {a.venue}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-medium">{a.matchDate}</div>
                        <div className="text-xs text-gray-400">{a.matchTime}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {a.refereeId ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800">
                              {/* 1. Try name on the appointment, 2. Try map by ID, 3. Fallback to 'Assigned' */}
                              {(a as any).refereeName || referees[a.refereeId]?.full_name || 'Assigned Official'}
                            </span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-tighter">
                              {a.officialRole || 'Referee'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Awaiting Assignee</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge status={a.status as AppointmentStatus} />
                          {a.status !== 'pending' && (
                            <span className="text-[10px] text-gray-500 italic">
                              {getStatusTimestamp(a)}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right print:hidden">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit — only for pending */}
                          <Button size="sm" variant="ghost"
                            onClick={() => openEditModal(a)}
                            className={`hover:bg-white border border-transparent hover:border-gray-200
                              ${a.status !== 'pending' ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title={a.status !== 'pending' ? 'Only pending can be edited' : 'Edit'}>
                            <Pencil className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                          </Button>

                          {/* Delete — only for pending */}
                          <Button size="sm" variant="ghost"
                            onClick={() => handleDeleteClick(a)}
                            className={`hover:bg-white border border-transparent hover:border-red-200
                              ${a.status !== 'pending' ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title={a.status !== 'pending' ? 'Only pending can be deleted' : 'Delete'}>
                            <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
                          </Button>

                          {/* Audit trail */}
                          <Button size="sm" variant="ghost"
                            onClick={() => setAuditId(a.id)}
                            className="hover:bg-white border border-transparent hover:border-gray-200"
                            title="View audit trail">
                            <ScrollText className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create dialog */}
      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setCreateOpen(false)}
      />

      {/* Audit trail drawer */}
      <AuditTrailDrawer appointmentId={auditId} onClose={() => setAuditId(null)} />

      {/* ── Edit Modal ── */}
      <Dialog open={!!editAppt} onOpenChange={v => !v && setEditAppt(null)}>
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
            This action cannot be undone. The appointment will be permanently removed.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white">
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoachDashboard;