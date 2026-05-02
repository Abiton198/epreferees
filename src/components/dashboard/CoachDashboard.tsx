import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import DashboardHeader from './DashboardHeader';
import StatusBadge from './StatusBadge';
import CreateAppointmentDialog from './CreateAppointmentDialog';
import AuditTrailDrawer from './AuditTrailDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import type { Appointment, AppointmentStatus, Profile } from '@/types';
import {
  Plus, Search, ScrollText, Printer, Calendar,
  MapPin, Trophy, CheckCircle2, Clock, XCircle, Loader2
} from 'lucide-react';

const CoachDashboard: React.FC = () => {
  const { profile } = useAuth();

  // Real-time Data State
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [referees, setReferees] = useState<Record<string, Profile>>({});
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI State
  const [createOpen, setCreateOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  /**
   * REAL-TIME LISTENERS
   */
  useEffect(() => {
    if (!profile?.id) return;

    setLoading(true);

    // 1. Listen to Appointments assigned to this coach
    const apptQuery = query(
      collection(db, "appointments"),
      where("createdBy", "==", profile.email), // Or profile.id depending on your mapping
      orderBy("createdAt", "desc")
    );

    const unsubAppts = onSnapshot(apptQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Appointment[];
      setAppts(list);
      setLoading(false);
    }, (err) => {
      console.error("Appointment listener error:", err);
      setLoading(false);
    });

    // 2. Listen to Referees for the mapping
    const unsubRefs = onSnapshot(collection(db, "referees"), (snapshot) => {
      const map: Record<string, Profile> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Profile;
        map[doc.id] = { ...data, id: doc.id };
      });
      setReferees(map);
    });

    // 3. Listen to Teams (to get names and homeGrounds/venues)
    const unsubTeams = onSnapshot(collection(db, "teams"), (snapshot) => {
      const teamList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTeams(teamList);
    });

    return () => {
      unsubAppts();
      unsubRefs();
      unsubTeams();
    };
  }, [profile?.id, profile?.email]);

  /**
   * COMPUTED VALUES
   */
  const filtered = useMemo(() => {
    return appts.filter((a) => {
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      const searchLower = search.toLowerCase();
      const matchesSearch = !search ||
        a.homeTeam?.toLowerCase().includes(searchLower) ||
        a.awayTeam?.toLowerCase().includes(searchLower) ||
        a.venue?.toLowerCase().includes(searchLower);

      return matchesStatus && matchesSearch;
    });
  }, [appts, search, statusFilter]);

  const stats = useMemo(() => ({
    total: appts.length,
    pending: appts.filter((a) => a.status === 'pending').length,
    accepted: appts.filter((a) => a.status === 'accepted').length,
    rejected: appts.filter((a) => a.status === 'rejected').length,
  }), [appts]);

  // Extract unique venues from teams for any dropdowns if needed elsewhere
  const venues = useMemo(() => [...new Set(teams.map(t => t.homeGround))].filter(Boolean), [teams]);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Coach Dashboard</h1>
            <p className="text-gray-600 mt-1 italic">
              Logged in as <span className="font-bold text-[#006747]">{profile?.full_name}</span>
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()} className="shadow-sm">
              <Printer className="w-4 h-4 mr-2" />
              Report
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-[#006747] hover:bg-[#004d35] shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Appointment
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, icon: Calendar, color: 'text-gray-700', bg: 'bg-gray-100' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-100' },
            { label: 'Accepted', value: stats.accepted, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100' },
            { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-rose-700', bg: 'bg-rose-100' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm transition-transform hover:translate-y-[-2px]">
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
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
              <SelectItem value="pending">Pending Approval</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Real-time Table */}
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
                    <th className="px-6 py-4 font-bold text-right print:hidden">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((a) => (
                    <tr key={a.id} className="group hover:bg-emerald-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">
                          {a.homeTeam} <span className="text-gray-400 font-normal mx-1 text-xs">vs</span> {a.awayTeam}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 mt-1 uppercase tracking-tighter bg-emerald-50 w-fit px-1.5 rounded">
                          <Trophy className="w-3 h-3" /> {a.game || 'League Match'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                          <MapPin className="w-4 h-4 text-gray-300" />
                          {a.venue}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-medium">{a.date}</div>
                        <div className="text-xs text-gray-400">{a.time}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {a.refereeId ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800">{referees[a.refereeId]?.full_name || 'Assigned'}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-tighter">Certified Official</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Awaiting Assignee</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <StatusBadge status={a.status as AppointmentStatus} />
                      </td>
                      <td className="px-6 py-4 text-right print:hidden">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAuditId(a.id)}
                          className="hover:bg-white border border-transparent hover:border-gray-200"
                        >
                          <ScrollText className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Passing loaded teams and venues to the dialog so it doesn't have to fetch again */}
      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        teams={teams}
        venues={venues}
      />
      <AuditTrailDrawer appointmentId={auditId} onClose={() => setAuditId(null)} />
    </div>
  );
};

export default CoachDashboard;