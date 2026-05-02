import React, { useEffect, useMemo, useState } from 'react';
import DashboardHeader from './DashboardHeader';
import StatusBadge from './StatusBadge';
import CreateAppointmentDialog from './CreateAppointmentDialog';
import AuditTrailDrawer from './AuditTrailDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCoachAppointments, fetchReferees } from '@/services/appointments';
import type { Appointment, AppointmentStatus, Profile } from '@/types';
import { Plus, Search, ScrollText, Printer, Calendar, MapPin, Trophy, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';

const CoachDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [referees, setReferees] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [list, refs] = await Promise.all([
        fetchCoachAppointments(profile.id),
        fetchReferees(),
      ]);
      setAppts(list);
      const map: Record<string, Profile> = {};
      refs.forEach((r) => (map[r.id] = r));
      setReferees(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [profile?.id]);

  const filtered = useMemo(() => {
    return appts.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (search && !a.match_title.toLowerCase().includes(search.toLowerCase()) && !a.venue.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [appts, search, statusFilter]);

  const stats = useMemo(() => ({
    total: appts.length,
    pending: appts.filter((a) => a.status === 'pending').length,
    accepted: appts.filter((a) => a.status === 'accepted').length,
    rejected: appts.filter((a) => a.status === 'rejected').length,
  }), [appts]);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Coach Dashboard</h1>
            <p className="text-gray-600 mt-1">Welcome back, {profile?.full_name}. Manage your match appointments.</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="bg-[#006747] hover:bg-[#004d35]">
              <Plus className="w-4 h-4 mr-2" />
              New Appointment
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
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{s.label}</div>
                  <div className="text-3xl font-black text-gray-900 mt-1">{s.value}</div>
                </div>
                <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center print:hidden">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by match or venue..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Appointments Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#006747]" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-700">No appointments yet</h3>
              <p className="text-sm text-gray-500 mt-1">Click "New Appointment" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-600">
                    <th className="px-4 py-3 font-semibold">Match</th>
                    <th className="px-4 py-3 font-semibold">Venue</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Referee</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-900">{a.match_title}</div>
                        {a.competition && (
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Trophy className="w-3 h-3" /> {a.competition}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{a.venue}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {new Date(a.match_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {a.referee_id ? referees[a.referee_id]?.full_name ?? '—' : <span className="text-gray-400 italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-4"><StatusBadge status={a.status as AppointmentStatus} /></td>
                      <td className="px-4 py-4 print:hidden">
                        <Button size="sm" variant="outline" onClick={() => setAuditId(a.id)}>
                          <ScrollText className="w-3.5 h-3.5 mr-1.5" />
                          Audit
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

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
      <AuditTrailDrawer appointmentId={auditId} onClose={() => setAuditId(null)} />
    </div>
  );
};

export default CoachDashboard;
