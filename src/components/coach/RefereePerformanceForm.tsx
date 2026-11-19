import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, Lock } from 'lucide-react';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/components/ui/use-toast';
import StarRatingInput from './StarRatingInput';
import type { CoachAppointment } from './types';
import { logCoachAudit } from './auditLogger';

interface Props {
    appointments: CoachAppointment[];
    coachUid: string;
    coachName: string;
    coachEmail: string;
    preselectedAppointmentId?: string;
    onSubmitted?: () => void;
}

const RefereePerformanceForm: React.FC<Props> = ({
    appointments,
    coachUid,
    coachName,
    coachEmail,
    preselectedAppointmentId,
    onSubmitted,
}) => {
    const [selectedApptId, setSelectedApptId] = useState<string>(preselectedAppointmentId || '');
    const [starRating, setStarRating] = useState<number>(0);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState<any>({
        refereeName: '',
        refereeEmail: '',
        refereeId: '',

        match: '',
        matchDate: '',
        venue: '',
        level: '',
        coachName: coachName || '',

        // GAME STATS
        penalties: '',
        breakdownPens: '',
        lineoutPens: '',
        scrumPens: '',
        spacePens: '',
        foulPlayPens: '',
        generalPlayPens: '',

        // COACHING NOTES
        improvementAreas1: '',
        improvementAreas2: '',
        improvementAreas3: '',
        strengthsNotes: '',

        // HIDDEN
        matchId: '',
    });

    // Auto-fill match & referee details when an appointed match is selected
    useEffect(() => {
        const appt = appointments.find((a) => a.id === selectedApptId);
        if (appt) {
            setFormData((prev: any) => ({
                ...prev,
                refereeName: appt.refereeName || '',
                refereeEmail: appt.refereeEmail || '',
                refereeId: appt.refereeId || '',
                match: appt.match || '',
                matchDate: appt.matchDate || '',
                venue: appt.venue || '',
                level: appt.level || '',
                coachName: coachName || prev.coachName,
                matchId: appt.matchId || appt.id,
            }));
        }
    }, [selectedApptId, appointments, coachName]);

    useEffect(() => {
        if (preselectedAppointmentId) {
            setSelectedApptId(preselectedAppointmentId);
        }
    }, [preselectedAppointmentId]);


    // dynamic calculations of penalities
    const PENALTY_STAT_FIELDS = [
        'breakdownPens',
        'scrumPens',
        'lineoutPens',
        'spacePens',
        'foulPlayPens',
        'generalPlayPens',
    ] as const;

    const handleChange = (field: string, value: string) => {
        setFormData((prev: any) => {
            const updated = { ...prev, [field]: value };

            // Auto-calculate total penalties whenever any breakdown category changes
            if (PENALTY_STAT_FIELDS.includes(field as any)) {
                const total = PENALTY_STAT_FIELDS.reduce(
                    (sum, key) => sum + (Math.max(0, Number(updated[key]) || 0)),
                    0
                );
                updated.penalties = String(total);
            }

            return updated;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedApptId) {
            toast({ title: 'Select an Appointed Match', description: 'Please choose an accepted match appointment first.', variant: 'destructive' });
            return;
        }

        if (starRating < 1 || starRating > 5) {
            toast({ title: 'Star Rating Required', description: 'Please select a 1 to 5 star performance rating.', variant: 'destructive' });
            return;
        }

        setSubmitting(true);
        try {
            // 1. Create clean Firestore document in `coachReports`
            const cleanReportDoc = {
                reportType: 'referee_performance',
                appointmentId: selectedApptId,
                matchId: formData.matchId,
                matchDetails: {
                    match: formData.match,
                    matchDate: formData.matchDate,
                    venue: formData.venue,
                    level: formData.level,
                },
                referee: {
                    uid: formData.refereeId,
                    name: formData.refereeName,
                    email: formData.refereeEmail,
                },
                coach: {
                    uid: coachUid,
                    name: formData.coachName || coachName,
                    email: coachEmail,
                },
                rating: starRating,
                gameStats: {
                    totalPenalties: Number(formData.penalties) || 0,
                    breakdownPens: Number(formData.breakdownPens) || 0,
                    lineoutPens: Number(formData.lineoutPens) || 0,
                    scrumPens: Number(formData.scrumPens) || 0,
                    spacePens: Number(formData.spacePens) || 0,
                    foulPlayPens: Number(formData.foulPlayPens) || 0,
                    generalPlayPens: Number(formData.generalPlayPens) || 0,
                },
                coachingNotes: {
                    strengths: formData.strengthsNotes.trim(),
                    improvementAreas: [
                        formData.improvementAreas1.trim(),
                        formData.improvementAreas2.trim(),
                        formData.improvementAreas3.trim(),
                    ].filter(Boolean),
                },
                status: 'submitted',
                createdAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, 'coachReports'), cleanReportDoc);

            // 2. Mark appointment as completed
            await updateDoc(doc(db, 'coachAppointments', selectedApptId), {
                status: 'completed',
                reportId: docRef.id,
                completedAt: serverTimestamp(),
            });

            // 3. Record detailed audit trail
            await logCoachAudit({
                action: 'PERFORMANCE_REPORT_SUBMITTED',
                actorId: coachUid,
                actorName: formData.coachName || coachName,
                actorRole: 'coach',
                matchId: formData.matchId,
                matchTitle: formData.match,
                refereeId: formData.refereeId,
                refereeName: formData.refereeName,
                rating: starRating,
                metadata: {
                    reportId: docRef.id,
                    appointmentId: selectedApptId,
                    venue: formData.venue,
                    matchDate: formData.matchDate,
                    level: formData.level,
                    totalPenalties: Number(formData.penalties) || 0,
                },
            });

            toast({
                title: 'Performance Report Submitted',
                description: `Report (${starRating}/5 stars) for ${formData.refereeName} saved and audited.`,
            });

            setStarRating(0);
            setSelectedApptId('');
            onSubmitted?.();
        } catch (err: any) {
            toast({ title: 'Submission Failed', description: err.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-xl border shadow-sm">
            <div className="border-b pb-4">
                <h3 className="text-lg font-bold text-[#006747]">Referee Match Performance Report</h3>
                <p className="text-xs text-gray-500">
                    Select an accepted match appointment to auto-fill match and referee details.
                </p>
            </div>

            {/* Step 1: Appointment Selector */}
            <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-lg space-y-2">
                <Label className="font-semibold text-[#006747]">Select Appointed Match *</Label>
                <Select value={selectedApptId} onValueChange={setSelectedApptId}>
                    <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Choose an accepted match appointment..." />
                    </SelectTrigger>
                    <SelectContent>
                        {appointments.length === 0 ? (
                            <SelectItem value="none" disabled>
                                No accepted appointments available
                            </SelectItem>
                        ) : (
                            appointments.map((appt) => (
                                <SelectItem key={appt.id} value={appt.id}>
                                    {appt.matchDate} — {appt.match} (Ref: {appt.refereeName})
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>
            </div>

            {/* Step 2: Auto-filled Locked Match Details */}
            <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <Lock size={13} /> Auto-Filled Appointment Details
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border">
                    <div>
                        <Label className="text-xs text-gray-500">Match Fixture</Label>
                        <Input value={formData.match} readOnly className="bg-gray-100 text-gray-700" />
                    </div>
                    <div>
                        <Label className="text-xs text-gray-500">Referee Name</Label>
                        <Input value={formData.refereeName} readOnly className="bg-gray-100 text-gray-700" />
                    </div>
                    <div>
                        <Label className="text-xs text-gray-500">Match Date</Label>
                        <Input value={formData.matchDate} readOnly className="bg-gray-100 text-gray-700" />
                    </div>
                    <div>
                        <Label className="text-xs text-gray-500">Venue & Level</Label>
                        <Input
                            value={formData.venue ? `${formData.venue} (${formData.level})` : ''}
                            readOnly
                            className="bg-gray-100 text-gray-700"
                        />
                    </div>
                </div>
            </div>

            {/* Step 3: Star Rating */}
            <div className="p-4 rounded-lg border bg-amber-50/30">
                <StarRatingInput
                    value={starRating}
                    onChange={setStarRating}
                    label="Referee Match Performance Rating"
                />
            </div>

            {/* Step 4: Game Penalty Stats */}
            {/* Step 4: Game Penalty Stats */}
            <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1">
                    <h4 className="text-sm font-semibold text-gray-800">Match Penalty Breakdown</h4>
                    <span className="text-xs font-semibold text-[#006747] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        Auto-Calculated Total: {Number(formData.penalties) || 0}
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                        <Label className="text-xs font-bold text-[#006747]">Total Penalties (Auto)</Label>
                        <Input
                            type="number"
                            min="0"
                            value={formData.penalties || '0'}
                            readOnly
                            className="bg-emerald-50/70 border-emerald-300 font-bold text-[#006747] cursor-not-allowed"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Breakdown</Label>
                        <Input
                            type="number"
                            min="0"
                            value={formData.breakdownPens}
                            onChange={(e) => handleChange('breakdownPens', e.target.value)}
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Scrum</Label>
                        <Input
                            type="number"
                            min="0"
                            value={formData.scrumPens}
                            onChange={(e) => handleChange('scrumPens', e.target.value)}
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Lineout / Maul</Label>
                        <Input
                            type="number"
                            min="0"
                            value={formData.lineoutPens}
                            onChange={(e) => handleChange('lineoutPens', e.target.value)}
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Offside / Space</Label>
                        <Input
                            type="number"
                            min="0"
                            value={formData.spacePens}
                            onChange={(e) => handleChange('spacePens', e.target.value)}
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Foul Play</Label>
                        <Input
                            type="number"
                            min="0"
                            value={formData.foulPlayPens}
                            onChange={(e) => handleChange('foulPlayPens', e.target.value)}
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">General Play</Label>
                        <Input
                            type="number"
                            min="0"
                            value={formData.generalPlayPens}
                            onChange={(e) => handleChange('generalPlayPens', e.target.value)}
                            placeholder="0"
                        />
                    </div>
                </div>
            </div>

            {/* Step 5: Detailed Coaching Notes */}
            <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-800 border-b pb-1">Detailed Coaching Notes</h4>
                <div>
                    <Label>Key Strengths Observed *</Label>
                    <Textarea
                        required
                        rows={3}
                        placeholder="Describe positioning, communication, advantage application, and game control..."
                        value={formData.strengthsNotes}
                        onChange={(e) => handleChange('strengthsNotes', e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <Label>Work-On #1 (Primary) *</Label>
                        <Textarea
                            required
                            rows={2}
                            placeholder="Primary technical or management focus..."
                            value={formData.improvementAreas1}
                            onChange={(e) => handleChange('improvementAreas1', e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>Work-On #2</Label>
                        <Textarea
                            rows={2}
                            placeholder="Secondary focus area..."
                            value={formData.improvementAreas2}
                            onChange={(e) => handleChange('improvementAreas2', e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>Work-On #3</Label>
                        <Textarea
                            rows={2}
                            placeholder="Additional observation..."
                            value={formData.improvementAreas3}
                            onChange={(e) => handleChange('improvementAreas3', e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <Button
                type="submit"
                disabled={submitting || !selectedApptId}
                className="w-full bg-[#006747] hover:bg-[#004d35] text-white"
            >
                {submitting ? <Loader2 className="mr-2 animate-spin" size={16} /> : <CheckCircle2 className="mr-2" size={16} />}
                Submit Performance Report & Record Audit
            </Button>
        </form>
    );
};

export default RefereePerformanceForm;