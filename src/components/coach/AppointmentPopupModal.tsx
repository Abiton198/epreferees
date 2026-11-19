import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Calendar,
    MapPin,
    Shield,
    User,
    CheckCircle2,
    XCircle,
    Loader2,
    ClipboardCheck,
    ArrowLeft,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/components/ui/use-toast';
import type { CoachAppointment } from './types';
import { logCoachAudit } from './auditLogger';

interface Props {
    appointment: CoachAppointment | null;
    coachUid: string;
    coachName: string;
    onAccepted: (appointment: CoachAppointment) => void;
    onDeclined?: (appointment: CoachAppointment, reason: string) => void;
}

const AppointmentPopupModal: React.FC<Props> = ({
    appointment,
    coachUid,
    coachName,
    onAccepted,
    onDeclined,
}) => {
    const [accepting, setAccepting] = useState(false);
    const [declining, setDeclining] = useState(false);
    const [showDeclineForm, setShowDeclineForm] = useState(false);
    const [declineReason, setDeclineReason] = useState('');

    // Reset decline state whenever a new appointment pops up
    useEffect(() => {
        setShowDeclineForm(false);
        setDeclineReason('');
        setAccepting(false);
        setDeclining(false);
    }, [appointment?.id]);

    if (!appointment) return null;

    const isBusy = accepting || declining;

    const handleAccept = async () => {
        setAccepting(true);
        try {
            const apptRef = doc(db, 'coachAppointments', appointment.id);
            await updateDoc(apptRef, {
                status: 'accepted',
                acceptedAt: serverTimestamp(),
            });

            // Also record coach acceptance on the parent match document if matchId exists
            if (appointment.matchId && appointment.matchId !== appointment.id) {
                try {
                    await updateDoc(doc(db, 'appointments', appointment.matchId), {
                        coachStatus: 'accepted',
                        coachAcceptedAt: serverTimestamp(),
                        auditTrail: arrayUnion({
                            action: 'coach_appointment_accepted',
                            by: coachUid,
                            byName: coachName,
                            byRole: 'coach',
                            timestamp: new Date().toISOString(),
                        }),
                    });
                } catch {
                    // Best-effort sync if parent doc isn't writable by coach
                }
            }

            await logCoachAudit({
                action: 'APPOINTMENT_ACCEPTED',
                actorId: coachUid,
                actorName: coachName,
                actorRole: 'coach',
                matchId: appointment.matchId || appointment.id,
                matchTitle: appointment.match,
                refereeId: appointment.refereeId,
                refereeName: appointment.refereeName,
                metadata: {
                    appointmentId: appointment.id,
                    roleAssigned: 'Referee Assessment Coach',
                    venue: appointment.venue,
                    matchDate: appointment.matchDate,
                    kickoffTime: appointment.kickoffTime || '',
                    level: appointment.level,
                    appointedBy: appointment.appointedBy || 'Executive',
                },
            });

            toast({
                title: 'Appointment Accepted',
                description: `You are confirmed as Referee Assessment Coach for ${appointment.match}.`,
            });

            onAccepted({ ...appointment, status: 'accepted' });
        } catch (err: any) {
            toast({
                title: 'Failed to accept appointment',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setAccepting(false);
        }
    };

    const handleDeclineSubmit = async () => {
        const trimmedReason = declineReason.trim();
        if (!trimmedReason) {
            toast({
                title: 'Reason Required',
                description: 'Please provide a brief reason before declining this appointment.',
                variant: 'destructive',
            });
            return;
        }

        setDeclining(true);
        try {
            const apptRef = doc(db, 'coachAppointments', appointment.id);
            await updateDoc(apptRef, {
                status: 'declined',
                declineReason: trimmedReason,
                declinedAt: serverTimestamp(),
            });

            // Also update parent match document so Exco sees the decline & reason
            if (appointment.matchId && appointment.matchId !== appointment.id) {
                try {
                    await updateDoc(doc(db, 'appointments', appointment.matchId), {
                        coachStatus: 'declined',
                        coachDeclineReason: trimmedReason,
                        coachDeclinedAt: serverTimestamp(),
                        auditTrail: arrayUnion({
                            action: 'coach_appointment_declined',
                            by: coachUid,
                            byName: coachName,
                            byRole: 'coach',
                            reason: trimmedReason,
                            timestamp: new Date().toISOString(),
                        }),
                    });
                } catch {
                    // Best-effort sync
                }
            }

            await logCoachAudit({
                action: 'APPOINTMENT_DECLINED' as any,
                actorId: coachUid,
                actorName: coachName,
                actorRole: 'coach',
                matchId: appointment.matchId || appointment.id,
                matchTitle: appointment.match,
                refereeId: appointment.refereeId,
                refereeName: appointment.refereeName,
                metadata: {
                    appointmentId: appointment.id,
                    roleAssigned: 'Referee Assessment Coach',
                    declineReason: trimmedReason,
                    venue: appointment.venue,
                    matchDate: appointment.matchDate,
                    level: appointment.level,
                    appointedBy: appointment.appointedBy || 'Executive',
                },
            });

            toast({
                title: 'Appointment Declined',
                description: 'Your decline and reason have been recorded and sent to the Executive.',
            });

            onDeclined?.({ ...appointment, status: 'declined' as any }, trimmedReason);
        } catch (err: any) {
            toast({
                title: 'Failed to decline appointment',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setDeclining(false);
        }
    };

    return (
        <Dialog open={!!appointment} onOpenChange={() => { }}>
            <DialogContent
                className="sm:max-w-lg border-t-4 border-t-[#006747]"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <Badge className="bg-emerald-100 text-[#006747] hover:bg-emerald-100 font-semibold">
                            <ClipboardCheck size={13} className="mr-1" />
                            Referee Assessment Coach Appointment
                        </Badge>
                        <span className="text-[11px] text-gray-400">
                            ID: {appointment.matchId || appointment.id}
                        </span>
                    </div>

                    <div className="bg-[#006747]/10 border border-[#006747]/20 rounded-lg p-3 text-left">
                        <p className="text-sm text-gray-800 leading-relaxed">
                            Dear <strong className="text-[#006747]">{coachName}</strong>, you have been
                            officially appointed by{' '}
                            <strong>{appointment.appointedBy || 'the EPRU Executive'}</strong> as the{' '}
                            <strong className="text-[#006747]">Referee Assessment Coach</strong> for the
                            fixture below:
                        </p>
                    </div>

                    <DialogTitle className="text-xl font-extrabold text-gray-900 pt-1">
                        {appointment.match}
                    </DialogTitle>
                </DialogHeader>

                {/* Match Details Card */}
                <div className="bg-gray-50 border rounded-lg p-4 space-y-3 text-sm">
                    <div className="flex items-center gap-2.5">
                        <User className="text-[#006747] shrink-0" size={16} />
                        <div>
                            <span className="text-gray-500">Referee to Assess: </span>
                            <span className="font-semibold text-gray-900">{appointment.refereeName}</span>
                            {appointment.refereeEmail && (
                                <span className="text-xs text-gray-500 ml-1">({appointment.refereeEmail})</span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <Calendar className="text-[#006747] shrink-0" size={16} />
                        <div>
                            <span className="text-gray-500">Date & Kickoff: </span>
                            <span className="font-medium text-gray-900">
                                {appointment.matchDate}{' '}
                                {appointment.kickoffTime ? `@ ${appointment.kickoffTime}` : ''}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <MapPin className="text-[#006747] shrink-0" size={16} />
                        <div>
                            <span className="text-gray-500">Venue: </span>
                            <span className="font-medium text-gray-900">{appointment.venue || 'TBC'}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <Shield className="text-[#006747] shrink-0" size={16} />
                        <div>
                            <span className="text-gray-500">Competition / Level: </span>
                            <span className="font-medium text-gray-900 capitalize">
                                {appointment.level || 'Club'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Conditional Decline Reason Input */}
                {showDeclineForm ? (
                    <div className="space-y-2 bg-red-50/70 border border-red-200 rounded-lg p-3.5 animate-in fade-in">
                        <Label htmlFor="decline-reason" className="text-xs font-bold text-red-800 uppercase">
                            Reason for Declining Appointment *
                        </Label>
                        <Textarea
                            id="decline-reason"
                            rows={3}
                            placeholder="e.g., Unavailable on match date, travel conflict, conflict of interest..."
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            className="bg-white border-red-200 text-sm"
                            disabled={isBusy}
                        />
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">
                        Accepting confirms your attendance and unlocks the pre-filled Referee Performance and
                        Incident report forms.
                    </p>
                )}

                {/* Action Buttons */}
                <DialogFooter className="flex-col sm:flex-row gap-2 pt-1">
                    {showDeclineForm ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setShowDeclineForm(false);
                                    setDeclineReason('');
                                }}
                                disabled={isBusy}
                                className="w-full sm:w-auto"
                            >
                                <ArrowLeft className="mr-1.5" size={15} />
                                Back
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={handleDeclineSubmit}
                                disabled={isBusy || !declineReason.trim()}
                                className="w-full sm:flex-1"
                            >
                                {declining ? (
                                    <Loader2 className="mr-2 animate-spin" size={16} />
                                ) : (
                                    <XCircle className="mr-2" size={16} />
                                )}
                                Confirm Decline & Log Reason
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowDeclineForm(true)}
                                disabled={isBusy}
                                className="w-full sm:w-auto border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                            >
                                <XCircle className="mr-1.5" size={16} />
                                Decline with Reason
                            </Button>

                            <Button
                                type="button"
                                onClick={handleAccept}
                                disabled={isBusy}
                                className="w-full sm:flex-1 bg-[#006747] hover:bg-[#004d35] text-white font-semibold"
                            >
                                {accepting ? (
                                    <Loader2 className="mr-2 animate-spin" size={16} />
                                ) : (
                                    <CheckCircle2 className="mr-2" size={16} />
                                )}
                                Accept Appointment
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AppointmentPopupModal;