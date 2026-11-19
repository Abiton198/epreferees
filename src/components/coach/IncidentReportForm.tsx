import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/components/ui/use-toast';
import type { CoachAppointment } from './types';
import { logCoachAudit } from './auditLogger';

interface Props {
    appointments: CoachAppointment[];
    coachUid: string;
    coachName: string;
    coachEmail: string;
    onSubmitted?: () => void;
}

const IncidentReportForm: React.FC<Props> = ({
    appointments,
    coachUid,
    coachName,
    coachEmail,
    onSubmitted,
}) => {
    const [selectedApptId, setSelectedApptId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    const [incidentData, setIncidentData] = useState({
        match: '',
        matchDate: '',
        venue: '',
        level: '',
        matchId: '',
        refereeId: '',
        refereeName: '',
        incidentCategory: 'foul_play',
        severity: 'medium',
        minuteOccurred: '',
        involvedParties: '',
        detailedDescription: '',
        actionTaken: '',
    });

    useEffect(() => {
        const appt = appointments.find((a) => a.id === selectedApptId);
        if (appt) {
            setIncidentData((prev) => ({
                ...prev,
                match: appt.match,
                matchDate: appt.matchDate,
                venue: appt.venue,
                level: appt.level,
                matchId: appt.matchId || appt.id,
                refereeId: appt.refereeId,
                refereeName: appt.refereeName,
            }));
        }
    }, [selectedApptId, appointments]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedApptId) {
            toast({ title: 'Select an Appointed Match', description: 'Choose a match appointment first.', variant: 'destructive' });
            return;
        }

        setSubmitting(true);
        try {
            const cleanIncidentDoc = {
                reportType: 'incident_report',
                appointmentId: selectedApptId,
                matchId: incidentData.matchId,
                matchDetails: {
                    match: incidentData.match,
                    matchDate: incidentData.matchDate,
                    venue: incidentData.venue,
                    level: incidentData.level,
                },
                referee: {
                    uid: incidentData.refereeId,
                    name: incidentData.refereeName,
                },
                coach: {
                    uid: coachUid,
                    name: coachName,
                    email: coachEmail,
                },
                incident: {
                    category: incidentData.incidentCategory,
                    severity: incidentData.severity,
                    minuteOccurred: incidentData.minuteOccurred,
                    involvedParties: incidentData.involvedParties.trim(),
                    description: incidentData.detailedDescription.trim(),
                    actionTaken: incidentData.actionTaken.trim(),
                },
                status: 'submitted',
                createdAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, 'coachReports'), cleanIncidentDoc);

            await logCoachAudit({
                action: 'INCIDENT_REPORT_SUBMITTED',
                actorId: coachUid,
                actorName: coachName,
                actorRole: 'coach',
                matchId: incidentData.matchId,
                matchTitle: incidentData.match,
                refereeId: incidentData.refereeId,
                refereeName: incidentData.refereeName,
                metadata: {
                    reportId: docRef.id,
                    category: incidentData.incidentCategory,
                    severity: incidentData.severity,
                    venue: incidentData.venue,
                    matchDate: incidentData.matchDate,
                },
            });

            toast({
                title: 'Incident Report Logged',
                description: 'The incident report has been saved and recorded in the audit trail.',
            });

            setSelectedApptId('');
            setIncidentData((prev) => ({
                ...prev,
                minuteOccurred: '',
                involvedParties: '',
                detailedDescription: '',
                actionTaken: '',
            }));
            onSubmitted?.();
        } catch (err: any) {
            toast({ title: 'Error submitting incident', description: err.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-xl border shadow-sm">
            <div className="border-b pb-4">
                <h3 className="text-lg font-bold text-red-700 flex items-center gap-2">
                    <AlertTriangle size={20} /> Match Incident Report
                </h3>
                <p className="text-xs text-gray-500">
                    Auto-fill match details from your appointment and document any serious foul play, abuse, or safety incident.
                </p>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-lg space-y-2">
                <Label className="font-semibold text-amber-900">Select Appointed Match *</Label>
                <Select value={selectedApptId} onValueChange={setSelectedApptId}>
                    <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Choose an appointed match..." />
                    </SelectTrigger>
                    <SelectContent>
                        {appointments.map((appt) => (
                            <SelectItem key={appt.id} value={appt.id}>
                                {appt.matchDate} — {appt.match} (Ref: {appt.refereeName})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border">
                <div>
                    <Label className="text-xs text-gray-500">Match</Label>
                    <Input value={incidentData.match} readOnly className="bg-gray-100" />
                </div>
                <div>
                    <Label className="text-xs text-gray-500">Referee</Label>
                    <Input value={incidentData.refereeName} readOnly className="bg-gray-100" />
                </div>
                <div>
                    <Label className="text-xs text-gray-500">Venue / Date</Label>
                    <Input
                        value={incidentData.venue ? `${incidentData.venue} • ${incidentData.matchDate}` : ''}
                        readOnly
                        className="bg-gray-100"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <Label>Incident Category *</Label>
                    <Select
                        value={incidentData.incidentCategory}
                        onValueChange={(v) => setIncidentData((p) => ({ ...p, incidentCategory: v }))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="foul_play">Red / Yellow Card & Foul Play</SelectItem>
                            <SelectItem value="match_official_abuse">Referee / Official Abuse</SelectItem>
                            <SelectItem value="crowd_spectator">Crowd / Touchline Misconduct</SelectItem>
                            <SelectItem value="venue_safety">Venue / Medical / Pitch Safety</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label>Severity Level *</Label>
                    <Select
                        value={incidentData.severity}
                        onValueChange={(v) => setIncidentData((p) => ({ ...p, severity: v }))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="low">Low (Advisory)</SelectItem>
                            <SelectItem value="medium">Medium (Review Needed)</SelectItem>
                            <SelectItem value="high">High (Disciplinary Action)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label>Match Minute / Time</Label>
                    <Input
                        placeholder="e.g., 64th min (2nd Half)"
                        value={incidentData.minuteOccurred}
                        onChange={(e) => setIncidentData((p) => ({ ...p, minuteOccurred: e.target.value }))}
                    />
                </div>
            </div>

            <div>
                <Label>Involved Players / Team / Spectators *</Label>
                <Input
                    required
                    placeholder="Team name, jersey number, or role of individuals involved"
                    value={incidentData.involvedParties}
                    onChange={(e) => setIncidentData((p) => ({ ...p, involvedParties: e.target.value }))}
                />
            </div>

            <div>
                <Label>Detailed Incident Account *</Label>
                <Textarea
                    required
                    rows={4}
                    placeholder="Provide a factual, chronological description of what occurred..."
                    value={incidentData.detailedDescription}
                    onChange={(e) => setIncidentData((p) => ({ ...p, detailedDescription: e.target.value }))}
                />
            </div>

            <div>
                <Label>Action Taken by Referee / Officials *</Label>
                <Textarea
                    required
                    rows={2}
                    placeholder="Describe sanctions, warnings, or interventions applied..."
                    value={incidentData.actionTaken}
                    onChange={(e) => setIncidentData((p) => ({ ...p, actionTaken: e.target.value }))}
                />
            </div>

            <Button
                type="submit"
                disabled={submitting || !selectedApptId}
                className="w-full bg-red-700 hover:bg-red-800 text-white"
            >
                {submitting && <Loader2 className="mr-2 animate-spin" size={16} />}
                Submit Incident Report & Record Audit
            </Button>
        </form>
    );
};

export default IncidentReportForm;