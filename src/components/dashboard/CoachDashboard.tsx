import React, { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, ClipboardCheck, AlertTriangle, History, FileSpreadsheet, MapPin } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

import AppointmentPopupModal from '@/components/coach/AppointmentPopupModal';
import RefereePerformanceForm from '@/components/coach/RefereePerformanceForm';
import IncidentReportForm from '@/components/coach/IncidentReportForm';
import CoachReportsList from '@/components/coach/CoachReportsList';
import type { CoachAppointment } from '@/components/coach/types';

const CoachDashboard: React.FC = () => {
    const { user, profile } = useAuth() as any;
    const [activeTab, setActiveTab] = useState('appointments');
    const [appointments, setAppointments] = useState<CoachAppointment[]>([]);
    const [reports, setReports] = useState<any[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [apptStatusFilter, setApptStatusFilter] = useState<'all' | 'accepted' | 'completed'>('all');
    const [selectedApptForReport, setSelectedApptForReport] = useState<string>('');

    const uid = user?.uid;

    // 1. Listen to coach appointments in real time (by coachId and fallback coachEmail)
    useEffect(() => {
        if (!uid) return;

        const byId = new Map<string, CoachAppointment>();
        const sync = () => setAppointments(Array.from(byId.values()));

        const qByUid = query(
            collection(db, 'coachAppointments'),
            where('coachId', '==', uid)
        );

        const unsubUid = onSnapshot(
            qByUid,
            (snap) => {
                snap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as CoachAppointment));
                sync();
            },
            (err) => console.error('[CoachDashboard] coachAppointments listener error:', err)
        );

        let unsubEmail = () => { };
        if (user?.email) {
            const qByEmail = query(
                collection(db, 'coachAppointments'),
                where('coachEmail', '==', user.email)
            );
            unsubEmail = onSnapshot(
                qByEmail,
                (snap) => {
                    snap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as CoachAppointment));
                    sync();
                },
                () => { }
            );
        }

        return () => {
            unsubUid();
            unsubEmail();
        };
    }, [uid, user?.email]);

    // 2. Listen to coach submitted reports using separate rule-safe queries
    // (Avoids `or()` queries which Firestore Security Rules reject if any branch isn't covered)
    useEffect(() => {
        if (!uid) return;

        const reportMap = new Map<string, any>();
        const syncReports = () => {
            const list = Array.from(reportMap.values());
            list.sort((a: any, b: any) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
                return timeB - timeA;
            });
            setReports(list);
        };

        const q1 = query(collection(db, 'coachReports'), where('coach.uid', '==', uid));
        const q2 = query(collection(db, 'coachReports'), where('coachId', '==', uid));

        const unsub1 = onSnapshot(
            q1,
            (snap) => {
                snap.docs.forEach((d) => reportMap.set(d.id, { id: d.id, ...d.data() }));
                syncReports();
            },
            (err) => console.warn('[CoachDashboard] coachReports (coach.uid) query:', err.message)
        );

        const unsub2 = onSnapshot(
            q2,
            (snap) => {
                snap.docs.forEach((d) => reportMap.set(d.id, { id: d.id, ...d.data() }));
                syncReports();
            },
            (err) => console.warn('[CoachDashboard] coachReports (coachId) query:', err.message)
        );

        return () => {
            unsub1();
            unsub2();
        };
    }, [uid]);

    // 3. Listen to coach audit trail (queries both `auditTrail` and `coachAuditTrail` safely)
    useEffect(() => {
        if (!uid) return;

        const logMap = new Map<string, any>();
        const syncLogs = () => {
            const list = Array.from(logMap.values());
            list.sort((a: any, b: any) => {
                const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
                const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });
            setAuditLogs(list);
        };

        const unsubAudit1 = onSnapshot(
            query(collection(db, 'auditTrail'), where('actorId', '==', uid)),
            (snap) => {
                snap.docs.forEach((d) => logMap.set(`at_${d.id}`, { id: d.id, ...d.data() }));
                syncLogs();
            },
            (err) => console.warn('[CoachDashboard] auditTrail query:', err.message)
        );

        const unsubAudit2 = onSnapshot(
            query(collection(db, 'coachAuditTrail'), where('actorId', '==', uid)),
            (snap) => {
                snap.docs.forEach((d) => logMap.set(`cat_${d.id}`, { id: d.id, ...d.data() }));
                syncLogs();
            },
            () => { }
        );

        return () => {
            unsubAudit1();
            unsubAudit2();
        };
    }, [uid]);

    // Track appointment IDs that already have a submitted report (even if appointment status wasn't updated)
    const completedAppointmentIds = useMemo(() => {
        const ids = new Set<string>();
        appointments.forEach((a) => {
            if (a.status === 'completed') ids.add(a.id);
        });
        reports.forEach((r) => {
            if (r.appointmentId) ids.add(r.appointmentId);
            if (r.matchId) ids.add(r.matchId);
        });
        return ids;
    }, [appointments, reports]);

    // Find first unaccepted executive appointment to display popup modal
    const pendingAppointment = useMemo(
        () => appointments.find((a) => a.status === 'pending') || null,
        [appointments]
    );

    // Accepted appointments available for auto-filling forms
    const fillableAppointments = useMemo(
        () =>
            appointments
                .filter((a) => a.status === 'accepted' || a.status === 'completed')
                .map((a) => ({
                    ...a,
                    status: completedAppointmentIds.has(a.id) ? 'completed' : a.status,
                })),
        [appointments, completedAppointmentIds]
    );

    const filteredAppointments = useMemo(() => {
        return appointments
            .filter((a) => a.status !== 'pending' && a.status !== 'declined')
            .map((a) => ({
                ...a,
                status: completedAppointmentIds.has(a.id) ? 'completed' : a.status,
            }))
            .filter((a) => apptStatusFilter === 'all' || a.status === apptStatusFilter);
    }, [appointments, completedAppointmentIds, apptStatusFilter]);

    const startPerformanceReport = (apptId: string) => {
        setSelectedApptForReport(apptId);
        setActiveTab('performance');
    };

    const displayName =
        profile?.full_name || user?.displayName || user?.email?.split('@')[0] || 'Coach';

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
            {/* Executive Appointment Popup Modal */}
            <AppointmentPopupModal
                appointment={pendingAppointment}
                coachUid={uid || ''}
                coachName={displayName}
                onAccepted={() => setActiveTab('appointments')}
            />

            {/* Header */}
            <div className="bg-[#006747] text-white p-6 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Match Official Coach Dashboard</h1>
                    <p className="text-emerald-100 text-sm mt-1">
                        Welcome back, {displayName.toUpperCase()} <br />
                        Manage appointments, submit graded reports & review audit logs
                    </p>
                </div>
                <div className="flex gap-3 text-center">
                    <div className="bg-white/10 px-4 py-2 rounded-lg">
                        <div className="text-xl font-bold">{fillableAppointments.length}</div>
                        <div className="text-xs text-emerald-100">Appointments</div>
                    </div>
                    <div className="bg-white/10 px-4 py-2 rounded-lg">
                        <div className="text-xl font-bold">{reports.length}</div>
                        <div className="text-xs text-emerald-100">Reports Filed</div>
                    </div>
                </div>
            </div>

            {/* Main Navigation Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid grid-cols-2 sm:grid-cols-5 h-auto gap-1 bg-gray-100 p-1 rounded-xl">
                    <TabsTrigger value="appointments" className="py-2.5 text-xs sm:text-sm">
                        <Calendar size={15} className="mr-1.5" /> Appointments
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="py-2.5 text-xs sm:text-sm">
                        <ClipboardCheck size={15} className="mr-1.5" /> Performance Report
                    </TabsTrigger>
                    <TabsTrigger value="incident" className="py-2.5 text-xs sm:text-sm">
                        <AlertTriangle size={15} className="mr-1.5" /> Incident Report
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="py-2.5 text-xs sm:text-sm">
                        <FileSpreadsheet size={15} className="mr-1.5" /> Submitted Reports ({reports.length})
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="py-2.5 text-xs sm:text-sm">
                        <History size={15} className="mr-1.5" /> Audit Trail ({auditLogs.length})
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: Accepted Appointments */}
                <TabsContent value="appointments" className="space-y-4">
                    <div className="flex items-center justify-between bg-white p-4 rounded-xl border">
                        <h2 className="font-semibold text-gray-800">My Match Appointments</h2>
                        <Select value={apptStatusFilter} onValueChange={(v: any) => setApptStatusFilter(v)}>
                            <SelectTrigger className="w-44">
                                <SelectValue placeholder="Filter status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Confirmed</SelectItem>
                                <SelectItem value="accepted">Pending Report</SelectItem>
                                <SelectItem value="completed">Report Submitted</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {filteredAppointments.length === 0 ? (
                        <div className="bg-white p-8 rounded-xl border text-center text-gray-500 text-sm">
                            No appointments found under this filter.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredAppointments.map((appt) => {
                                const isCompleted = appt.status === 'completed';
                                return (
                                    <div key={appt.id} className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <Badge variant="outline" className="mb-1">{appt.level}</Badge>
                                                <h3 className="font-bold text-gray-900">{appt.match}</h3>
                                            </div>
                                            <Badge
                                                className={
                                                    isCompleted
                                                        ? 'bg-emerald-100 text-[#006747] font-bold'
                                                        : 'bg-amber-100 text-amber-800'
                                                }
                                            >
                                                {isCompleted ? '✓ Report Submitted' : 'Accepted'}
                                            </Badge>
                                        </div>

                                        <div className="text-xs text-gray-600 space-y-1">
                                            <p><strong>Referee:</strong> {appt.refereeName}</p>
                                            <p className="flex items-center gap-1">
                                                <Calendar size={13} /> {appt.matchDate} {appt.kickoffTime && `@ ${appt.kickoffTime}`}
                                            </p>
                                            <p className="flex items-center gap-1">
                                                <MapPin size={13} /> {appt.venue}
                                            </p>
                                        </div>

                                        <Button
                                            size="sm"
                                            disabled={isCompleted}
                                            onClick={() => startPerformanceReport(appt.id)}
                                            className={`w-full ${isCompleted
                                                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed border'
                                                    : 'bg-[#006747] hover:bg-[#004d35] text-white'
                                                }`}
                                        >
                                            {isCompleted ? 'Report Submitted Successfully' : 'Fill Match Performance Report'}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* Tab 2: Referee Performance Report */}
                <TabsContent value="performance">
                    <RefereePerformanceForm
                        appointments={fillableAppointments}
                        coachUid={uid || ''}
                        coachName={displayName}
                        coachEmail={user?.email || ''}
                        preselectedAppointmentId={selectedApptForReport}
                        submittedAppointmentIds={Array.from(completedAppointmentIds)}
                        onSubmitted={() => {
                            setSelectedApptForReport('');
                            setActiveTab('reports');
                        }}
                    />
                </TabsContent>

                {/* Tab 3: Incident Report */}
                <TabsContent value="incident">
                    <IncidentReportForm
                        appointments={fillableAppointments}
                        coachUid={uid || ''}
                        coachName={displayName}
                        coachEmail={user?.email || ''}
                        onSubmitted={() => setActiveTab('reports')}
                    />
                </TabsContent>

                {/* Tab 4: Submitted Reports */}
                <TabsContent value="reports">
                    <CoachReportsList reports={reports} />
                </TabsContent>

                {/* Tab 5: Detailed Audit Trail */}
                <TabsContent value="audit">
                    <div className="bg-white rounded-xl border shadow-sm divide-y">
                        <div className="p-4">
                            <h3 className="font-bold text-gray-800">Coach Activity & Match Audit Trail</h3>
                            <p className="text-xs text-gray-500">
                                Immutable log of appointment acceptances, match details, star ratings, and report submissions.
                            </p>
                        </div>
                        {auditLogs.length === 0 ? (
                            <div className="p-8 text-center text-sm text-gray-500">No audit entries recorded yet.</div>
                        ) : (
                            auditLogs.map((log) => (
                                <div key={log.id} className="p-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <div>
                                        <span className="font-semibold text-[#006747]">
                                            {(log.action || 'ACTIVITY').replace(/_/g, ' ')}
                                        </span>
                                        <p className="text-xs text-gray-600">
                                            Match: <strong>{log.matchTitle || log.match}</strong> • Referee: <strong>{log.refereeName}</strong>
                                            {log.rating ? ` • Rating: ${log.rating}/5 ★` : ''}
                                        </p>
                                        {(log.metadata?.venue || log.venue) && (
                                            <p className="text-xs text-gray-400">
                                                Venue: {log.metadata?.venue || log.venue} | Date: {log.metadata?.matchDate || log.matchDate}
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {log.timestamp?.toDate
                                            ? log.timestamp.toDate().toLocaleString()
                                            : log.timestamp
                                                ? new Date(log.timestamp).toLocaleString()
                                                : 'Just now'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default CoachDashboard;