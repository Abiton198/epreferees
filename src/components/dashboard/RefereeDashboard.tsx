import React, { useEffect, useMemo, useState } from 'react';
import DashboardHeader from './DashboardHeader';
import StatusBadge from './StatusBadge';
import AuditTrailDrawer from './AuditTrailDrawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRefereeAppointments, fetchUserAuditTrail, updateAppointmentStatus, submitFeedback } from '@/services/appointments';
import { toast } from '@/components/ui/use-toast';
import type { Appointment, AppointmentStatus, AuditLog } from '@/types';
import { Calendar, MapPin, Trophy, Check, X, MessageSquare, Loader2, Clock, ScrollText, History } from 'lucide-react';

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

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [list, hist] = await Promise.all([
        fetchRefereeAppointments(profile.id),
        fetchUserAuditTrail(profile.id),
      ]);
      setAppts(list);
      setHistory(hist);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [profile?.id]);

  const handleAction = async (appt: Appointment, status: AppointmentStatus) => {
    if (!profile) return;
    setActing(appt.id);
    try {
      await updateAppointmentStatus(appt.id, status, { id: profile.id, role: profile.role, full_name: profile.full_name });

      toast({ title: `Appointment ${status}`, description: appt.match_title });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setActing(null);
    }
  };

  const handleFeedback = async () => {
    if (!profile || !feedbackTarget) return;
    setSubmittingFb(true);
    try {
      await submitFeedback(feedbackTarget.id, feedbackText, { id: profile.id, role: profile.role });
      toast({ title: 'Feedback submitted' });
      setFeedbackTarget(null);
      setFeedbackText('');
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmittingFb(false);
    }
  };

  const stats = useMemo(() => ({
    pending: appts.filter((a) => a.status === 'pending').length,
    accepted: appts.filter((a) => a.status === 'accepted').length,
    total: appts.length,
  }), [appts]);

  const actionLabel = (a: string) => a.replace('STATUS_', '').replace('_', ' ').toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <h1 className="text-3xl font-black text-gray-900">Referee Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back, {profile?.full_name}. Review your assigned matches.</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6 mb-8">
          {[
            { label: 'Total Assigned', value: stats.total, icon: Calendar, bg: 'bg-gray-100', color: 'text-gray-700' },
            { label: 'Pending Response', value: stats.pending, icon: Clock, bg: 'bg-amber-100', color: 'text-amber-700' },
            { label: 'Accepted', value: stats.accepted, icon: Check, bg: 'bg-emerald-100', color: 'text-emerald-700' },
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

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Appointments */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Assigned Appointments</h2>
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#006747]" /></div>
            ) : appts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 text-center py-16 px-4">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-700">No appointments assigned</h3>
                <p className="text-sm text-gray-500 mt-1">A coach will assign matches to you.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {appts.map((a) => (
                  <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-lg text-gray-900">{a.match_title}</h3>
                          <StatusBadge status={a.status as AppointmentStatus} />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" />{new Date(a.match_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                          <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{a.venue}</div>
                          {a.competition && <div className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-gray-400" />{a.competition}</div>}
                        </div>
                        {a.notes && <p className="mt-3 text-sm text-gray-700 bg-gray-50 rounded p-2 border border-gray-100">{a.notes}</p>}
                        {a.feedback && (
                          <p className="mt-2 text-sm text-emerald-800 bg-emerald-50 rounded p-2 border border-emerald-100">
                            <span className="font-semibold">Your feedback: </span>{a.feedback}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                      {a.status === 'pending' && (
                        <>
                          <Button size="sm" onClick={() => handleAction(a, 'accepted')} disabled={acting === a.id} className="bg-emerald-600 hover:bg-emerald-700">
                            {acting === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleAction(a, 'rejected')} disabled={acting === a.id} className="border-rose-300 text-rose-700 hover:bg-rose-50">
                            <X className="w-3.5 h-3.5 mr-1.5" />
                            Reject
                          </Button>
                        </>
                      )}
                      {a.status === 'accepted' && (
                        <Button size="sm" variant="outline" onClick={() => { setFeedbackTarget(a); setFeedbackText(a.feedback ?? ''); }}>
                          <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                          {a.feedback ? 'Update' : 'Add'} Feedback
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setAuditId(a.id)}>
                        <ScrollText className="w-3.5 h-3.5 mr-1.5" />
                        Audit Trail
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity history */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <History className="w-5 h-5 text-[#006747]" /> My Activity
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4 max-h-[600px] overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {history.map((h) => (
                    <li key={h.id} className="text-sm border-l-2 border-[#FFB81C] pl-3 py-1">
                      <div className="font-semibold text-gray-900 capitalize">{actionLabel(h.action)}</div>
                      <div className="text-xs text-gray-500">{new Date(h.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>

      <AuditTrailDrawer appointmentId={auditId} onClose={() => setAuditId(null)} />

      <Dialog open={!!feedbackTarget} onOpenChange={(o) => !o && setFeedbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Match Feedback</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">{feedbackTarget?.match_title}</div>
          <Textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={6} placeholder="Your observations, incidents, recommendations..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackTarget(null)}>Cancel</Button>
            <Button onClick={handleFeedback} disabled={submittingFb || !feedbackText.trim()} className="bg-[#006747] hover:bg-[#004d35]">
              {submittingFb && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RefereeDashboard;
