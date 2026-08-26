import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import {
  Loader2, Shield, Trophy, ChevronLeft, ChevronRight, AlertTriangle,
  Clock, MapPin, Calendar, CheckCircle2, UserX, Flag, ArrowLeft
} from 'lucide-react';
import {
  collection, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, query, where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
  homeGround?: string;
}

interface RefereeOption {
  id: string;
  full_name?: string;
  fullName?: string;
  displayName?: string;
  name?: string;
  email?: string;
}

interface Appointment {
  id: string;
  refereeId: string;
  matchDate: string;
  matchTime: string;
  date?: string;
  time?: string;
  homeTeam: string;
  awayTeam: string;
  matchTitle?: string;
  venue: string;
  status?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
  editData?: any;
}

const resolveName = (obj: any): string =>
  obj?.full_name || obj?.fullName || obj?.displayName || obj?.name || obj?.email || 'Unknown';

// ─── Component ────────────────────────────────────────────────────────────────

const CreateAppointmentDialog: React.FC<Props> = ({ open, onOpenChange, onCreated, editData }) => {
  const { user, profile } = useAuth() as any;

  // Data states
  const [teams, setTeams] = useState<Team[]>([]);
  const [referees, setReferees] = useState<RefereeOption[]>([]);
  const [existingAppointments, setExistingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [step, setStep] = useState(1);

  // Form states
  const [formData, setFormData] = useState({
    competitionType: '' as 'club' | 'school' | 'tournament' | '',
    competitionName: '',
    teamAId: '',
    teamAManual: '',
    teamBId: '',
    teamBManual: '',
    teamLevel: 'main',
    matchDate: '',
    matchTime: '',
    venue: '',
    refereeId: '',
    refereeRole: 'referee' as 'referee' | 'assistant',
    officialRole: 'Referee',
    notes: ''
  });

  // Conflict modal states
  const [showSoftConflictModal, setShowSoftConflictModal] = useState(false);
  const [showHardConflictModal, setShowHardConflictModal] = useState(false);
  const [conflictingAppointment, setConflictingAppointment] = useState<Appointment | null>(null);
  const [pendingRefereeSelection, setPendingRefereeSelection] = useState<RefereeOption | null>(null);

  // ── NEW: Pending confirmation state ──────────────────────────────────────────
  // When coach tries to save without a referee, we intercept and show a
  // confirmation view before actually writing to Firestore.
  const [showPendingConfirm, setShowPendingConfirm] = useState(false);

  const isClub = formData.competitionType === 'club';

  const [teamASearch, setTeamASearch] = useState('');
  const [teamBSearch, setTeamBSearch] = useState('');
  const [refereeSearch, setRefereeSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('Referee');

  const officialRoles = [
    'Referee',
    'Assistant Referee',
    '1st Reserve',
    '2nd Team',
    '4th Official',
    '5th Official',
  ];

  // ── Derived ──────────────────────────────────────────────────────────────────
  const hasReferee = !!formData.refereeId;

  /** True when editing an appointment that was previously saved without a referee */
  const isCompletingPendingFixture =
    editData?.status === 'pending_assignment' && !editData?.refereeId;

  // Fixture label helper (used in the confirmation view)
  const fixtureSummary = (() => {
    const home = isClub
      ? teams.find(t => t.id === formData.teamAId)?.name || '?'
      : formData.teamAManual || '?';
    const away = isClub
      ? teams.find(t => t.id === formData.teamBId)?.name || '?'
      : formData.teamBManual || '?';
    return { home, away };
  })();

  // ─── Initialization ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setFetchingData(true);
      try {
        const [teamsSnap, usersSnap, refereesSnap, apptsSnap] = await Promise.all([
          getDocs(collection(db, 'teams')),
          getDocs(query(collection(db, 'users'), where('role', '==', 'referee'))),
          getDocs(collection(db, 'referees')),
          getDocs(collection(db, 'appointments')),
        ]);

        setTeams(teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));

        const apptsList: Appointment[] = apptsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Appointment))
          .filter(a => a.status !== 'cancelled' && a.status !== 'rejected');
        setExistingAppointments(apptsList);

        const getDisplayName = (data: any) =>
          data.full_name || data.fullName || data.displayName || data.name || data.email || 'Unnamed Ref';
        const normalizeEmail = (s: string) => (s || '').trim().toLowerCase();

        const byEmail = new Map<string, any>();

        usersSnap.docs.forEach(d => {
          const data = d.data();
          const email = normalizeEmail(data.email);
          if (!email) return;
          byEmail.set(email, { id: d.id, ...data, email, displayName: getDisplayName(data) });
        });

        refereesSnap.docs.forEach(d => {
          const data = d.data();
          const email = normalizeEmail(data.email);
          if (!email) return;
          byEmail.set(email, { id: d.id, ...data, email, displayName: getDisplayName(data) });
        });

        setReferees(Array.from(byEmail.values()));

        if (editData) {
          setFormData({
            competitionType: editData.competitionType || '',
            competitionName: editData.competition || '',
            teamAId: editData.homeTeamId || '',
            teamAManual: !editData.homeTeamId ? editData.homeTeam : '',
            teamBId: editData.awayTeamId || '',
            teamBManual: !editData.awayTeamId ? editData.awayTeam : '',
            teamLevel: editData.teamLevel || 'main',
            matchDate: editData.matchDate || editData.date || '',
            matchTime: editData.matchTime || editData.time || '',
            venue: editData.venue || '',
            refereeId: editData.refereeId || '',
            refereeRole: editData.refereeRole || 'referee',
            officialRole: editData.officialRole || 'Referee',
            notes: editData.notes || ''
          });
          if (editData.refereeName) setRefereeSearch(editData.refereeName);

          // If completing a pending fixture jump straight to step 4
          if (isCompletingPendingFixture) setStep(4);
        } else {
          setStep(1);
          setShowPendingConfirm(false);
          setFormData({
            competitionType: '',
            competitionName: '',
            teamAId: '',
            teamAManual: '',
            teamBId: '',
            teamBManual: '',
            teamLevel: 'main',
            matchDate: '',
            matchTime: '',
            venue: '',
            refereeId: '',
            refereeRole: 'referee',
            officialRole: 'Referee',
            notes: ''
          });
          setRefereeSearch('');
        }
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setFetchingData(false);
      }
    };

    fetchData();
  }, [open, editData]);

  // ─── Conflict Check ────────────────────────────────────────────────────────────

  const handleRefereeSelect = (referee: RefereeOption | null) => {
    if (!referee) {
      setFormData(prev => ({ ...prev, refereeId: '' }));
      setRefereeSearch('');
      setPendingRefereeSelection(null);
      setConflictingAppointment(null);
      return;
    }

    const otherAppointments = existingAppointments.filter(
      a => !editData || a.id !== editData.id
    );

    const assignedMatchOnSameDay = otherAppointments.find(a => {
      const matchDate = a.matchDate || a.date;
      return a.refereeId === referee.id && matchDate === formData.matchDate;
    });

    if (assignedMatchOnSameDay) {
      const existingTime = assignedMatchOnSameDay.matchTime || assignedMatchOnSameDay.time;
      if (existingTime === formData.matchTime) {
        setConflictingAppointment(assignedMatchOnSameDay);
        setPendingRefereeSelection(referee);
        setShowHardConflictModal(true);
        return;
      }
      setConflictingAppointment(assignedMatchOnSameDay);
      setPendingRefereeSelection(referee);
      setShowSoftConflictModal(true);
      return;
    }

    applyRefereeSelection(referee);
  };

  const applyRefereeSelection = (referee: RefereeOption) => {
    updateField('refereeId', referee.id);
    updateField('officialRole', selectedRole);
    setRefereeSearch(resolveName(referee));
  };

  // ─── Validation ────────────────────────────────────────────────────────────────

  const validateStep = () => {
    switch (step) {
      case 1: return Boolean(formData.competitionType);
      case 2:
        if (isClub) {
          return Boolean(formData.teamAId) &&
            Boolean(formData.teamBId) &&
            formData.teamAId !== formData.teamBId;
        }
        return Boolean(formData.teamAManual?.trim()) && Boolean(formData.teamBManual?.trim());
      case 3:
        return Boolean(formData.matchDate) &&
          Boolean(formData.matchTime) &&
          Boolean(formData.venue?.trim());
      case 4: return true;
      default: return false;
    }
  };

  // ─── NEW: Save-click interceptor ──────────────────────────────────────────────
  // If no referee selected on step 4 we show the pending confirmation view
  // instead of writing straight to Firestore.
  const handleSaveClick = () => {
    if (!hasReferee) {
      setShowPendingConfirm(true);
      return;
    }
    handleSubmit();
  };

  // ─── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const validRefereeId = formData.refereeId?.trim() || null;
      const isAssigned = Boolean(validRefereeId);

      const selectedTeamA = teams.find(t => t.id === formData.teamAId);
      const selectedTeamB = teams.find(t => t.id === formData.teamBId);
      const assignedRef = isAssigned ? referees.find(r => r.id === validRefereeId) : null;

      const homeName = isClub ? (selectedTeamA?.name || '') : (formData.teamAManual || '');
      const awayName = isClub ? (selectedTeamB?.name || '') : (formData.teamBManual || '');

      // ── Status logic ──────────────────────────────────────────────────────────
      // pending_assignment → no referee yet, fixture saved for later completion
      // pending           → referee assigned by coach, waiting referee acceptance
      const calculatedStatus = isAssigned ? 'pending' : 'pending_assignment';

      const appointmentPayload = {
        competitionType: formData.competitionType || '',
        competition: formData.competitionName || formData.competitionType || '',
        competitionName: formData.competitionName || '',

        homeTeamId: formData.teamAId || null,
        awayTeamId: formData.teamBId || null,
        homeTeam: homeName,
        awayTeam: awayName,
        matchTitle: `${homeName} vs ${awayName}`,

        matchDate: formData.matchDate,
        matchTime: formData.matchTime,
        venue: formData.venue || '',
        notes: formData.notes || '',

        date: formData.matchDate,
        time: formData.matchTime,
        role: formData.officialRole || 'Referee',

        refereeId: validRefereeId,
        refereeName: assignedRef ? resolveName(assignedRef) : null,
        refereeEmail: assignedRef?.email || null,
        refereeRole: formData.refereeRole || 'referee',
        officialRole: formData.officialRole || 'Referee',

        teamLevel: formData.teamLevel || 'main',
        coachId: profile?.id || user?.uid || null,
        coachName: profile?.firstName || profile?.displayName || user?.displayName || 'Coach',
        coachEmail: profile?.email || user?.email || null,

        status: calculatedStatus,
        updatedAt: serverTimestamp(),
      };

      const currentTimestamp = new Date().toISOString();

      if (editData?.id) {
        // ── Audit entry ─────────────────────────────────────────────────────────
        const auditEntry = {
          action: isAssigned && !editData.refereeId ? 'completed' : 'edited',
          by: user?.uid || 'unknown',
          byName: user?.displayName || user?.email || 'Coach',
          byRole: 'coach',
          timestamp: currentTimestamp,
          details: {
            oldHomeTeam: editData.homeTeam || '',
            newHomeTeam: homeName,
            oldAwayTeam: editData.awayTeam || '',
            newAwayTeam: awayName,
            oldVenue: editData.venue || '',
            newVenue: formData.venue,
            oldDate: editData.matchDate || '',
            newDate: formData.matchDate,
            oldTime: editData.matchTime || '',
            newTime: formData.matchTime,
            oldReferee: editData.refereeName || 'Unassigned',
            newReferee: assignedRef ? resolveName(assignedRef) : 'Unassigned',
            oldOfficialRole: editData.officialRole || '',
            newOfficialRole: formData.officialRole || '',
            statusChange: `${editData.status || 'pending_assignment'} → ${calculatedStatus}`,
          }
        };

        await updateDoc(doc(db, 'appointments', editData.id), {
          ...appointmentPayload,
          auditTrail: [...(editData.auditTrail || []), auditEntry]
        });

        // ── NEW: Notification trigger ────────────────────────────────────────────
        // Only fires when we are COMPLETING a previously pending fixture
        // (editData had no refereeId, we now have one).
        if (!editData.refereeId && validRefereeId && assignedRef) {
          try {
            await addDoc(collection(db, 'notifications'), {
              type: 'appointment_assigned',
              recipientId: validRefereeId,
              recipientEmail: assignedRef.email || null,
              recipientName: resolveName(assignedRef),
              appointmentId: editData.id,
              matchTitle: `${homeName} vs ${awayName}`,
              matchDate: formData.matchDate,
              matchTime: formData.matchTime,
              venue: formData.venue,
              competition: formData.competitionType || '',
              officialRole: formData.officialRole || 'Referee',
              sentBy: user?.displayName || user?.email || 'Coach',
              sentByUid: user?.uid || null,
              createdAt: serverTimestamp(),
              read: false,
            });
          } catch (notifErr) {
            // Non-blocking — appointment is saved, notification best-effort
            console.warn('Notification write failed (non-blocking):', notifErr);
          }
        }

        toast({
          title: isAssigned && !editData.refereeId
            ? '✅ Appointment Completed'
            : isAssigned
              ? 'Appointment Updated'
              : 'Fixture Saved as Pending',
          description: isAssigned && !editData.refereeId
            ? `${resolveName(assignedRef!)} has been appointed. Notification sent.`
            : isAssigned
              ? 'Referee details updated.'
              : 'No referee assigned — you can complete this fixture later.',
        });

      } else {
        // ── Create new appointment ──────────────────────────────────────────────
        await addDoc(collection(db, 'appointments'), {
          ...appointmentPayload,
          createdAt: serverTimestamp(),
          auditTrail: [{
            action: 'created',
            by: user?.uid || 'unknown',
            byName: user?.displayName || user?.email || 'Coach',
            byRole: 'coach',
            timestamp: currentTimestamp,
          }]
        });

        toast({
          title: isAssigned ? 'Appointment Created' : '⏳ Fixture Saved as Pending',
          description: isAssigned
            ? 'Match scheduled. Awaiting referee acceptance.'
            : 'Fixture saved without a referee. Complete it from your dashboard.',
        });
      }

      setShowPendingConfirm(false);
      if (onCreated) onCreated();
      if (onOpenChange) onOpenChange(false);

    } catch (err: any) {
      console.error('Appointment save error:', err);
      toast({
        title: 'Error Saving Appointment',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredTeamA = teams.filter(t => t.name.toLowerCase().includes(teamASearch.toLowerCase()));
  const filteredTeamB = teams.filter(t => t.name.toLowerCase().includes(teamBSearch.toLowerCase()));
  const filteredReferees = referees.filter(r => resolveName(r).toLowerCase().includes(refereeSearch.toLowerCase()));

  const updateField = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => {
        if (!v) {
          setShowPendingConfirm(false);
          setStep(1);
        }
        onOpenChange(v);
      }}>
        <DialogContent className="sm:max-w-2xl p-0 bg-white flex flex-col max-h-[90vh] overflow-hidden">

          {/* ── Header ─────────────────────────────────────────────────────────── */}
          <DialogHeader className={`p-6 text-white transition-colors shrink-0 ${showPendingConfirm ? 'bg-amber-600' : 'bg-[#006747]'}`}>
            <DialogTitle className="flex items-center gap-2 text-xl">
              {showPendingConfirm ? (
                <><Flag size={20} /> Save as Pending Fixture</>
              ) : editData ? (
                isCompletingPendingFixture
                  ? <><CheckCircle2 size={20} /> Complete Pending Fixture</>
                  : <><Shield size={20} /> Edit Appointment</>
              ) : (
                <><Trophy size={20} /> Create New Appointment</>
              )}
            </DialogTitle>
            {isCompletingPendingFixture && !showPendingConfirm && (
              <p className="text-sm text-white/80 mt-1">
                Assign a referee to complete this fixture
              </p>
            )}
          </DialogHeader>

          {/* ── Step progress bar (hidden during confirm) ─────────────────────── */}
          {!showPendingConfirm && (
            <div className="flex border-b shrink-0">
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  className={`flex-1 h-1.5 transition-colors ${step >= s ? 'bg-[#006747]' : 'bg-slate-100'}`}
                />
              ))}
            </div>
          )}

          {/* ── Body — scrollable, footer stays pinned ────────────────────────── */}
          <div className="p-8 flex-1 overflow-y-auto">

            {/* ═══════════════════════════════════════════════════════════════════
                PENDING CONFIRMATION VIEW
                Shown when coach tries to save step 4 without a referee.
                ═══════════════════════════════════════════════════════════════════ */}
            {showPendingConfirm && (
              <div className="flex flex-col items-center gap-5 py-2 animate-in fade-in slide-in-from-bottom-2">

                {/* Icon */}
                <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <Flag className="w-8 h-8 text-amber-600" />
                </div>

                {/* Heading */}
                <div className="text-center">
                  <h3 className="text-lg font-black text-slate-800">
                    Save Without a Referee?
                  </h3>
                  <p className="text-sm text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                    No referee has been assigned. This fixture will be saved as{' '}
                    <span className="font-bold text-amber-700 uppercase tracking-wide">Pending</span>.
                    You can assign a referee at any time from your dashboard.
                  </p>
                </div>

                {/* Fixture summary card */}
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <p className="font-black text-slate-900 text-base">
                    {fixtureSummary.home}
                    <span className="text-slate-400 font-normal mx-2 text-sm">vs</span>
                    {fixtureSummary.away}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formData.matchDate || 'No date'} @ {formData.matchTime || '??:??'}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {formData.venue || 'No venue'}
                    </span>
                    <span className="flex items-center gap-1 capitalize">
                      <Trophy className="w-3 h-3" />
                      {formData.competitionType || 'Match'}
                    </span>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-200 text-[10px] font-black uppercase tracking-wider text-amber-800">
                    <Clock className="w-3 h-3" />
                    Pending — No Referee
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col w-full gap-2.5">

                  {/* PRIMARY: Save as pending */}
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white w-full font-bold h-11"
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
                    Continue — Save as Pending Fixture
                  </Button>

                  {/* SECONDARY: Go back and assign referee */}
                  <Button
                    variant="outline"
                    className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-11"
                    onClick={() => setShowPendingConfirm(false)}
                    disabled={loading}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back — Assign a Referee Now
                  </Button>

                  {/* TERTIARY: Discard & close */}
                  <button
                    onClick={() => {
                      setShowPendingConfirm(false);
                      onOpenChange(false);
                    }}
                    disabled={loading}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors text-center py-1 font-medium"
                  >
                    Discard — Close Without Saving
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                NORMAL STEP VIEWS (hidden while pending confirm is showing)
                ═══════════════════════════════════════════════════════════════════ */}

            {/* STEP 1: Competition type */}
            {!showPendingConfirm && step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <Label className="text-lg font-bold">Select Competition Category</Label>
                <div className="grid grid-cols-1 gap-4">
                  {['club', 'school', 'tournament'].map(type => (
                    <button
                      key={type}
                      onClick={() => updateField('competitionType', type)}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${formData.competitionType === type
                        ? 'border-[#006747] bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-400'
                        }`}
                    >
                      <span className="font-bold capitalize">{type} Match</span>
                      <p className="text-sm text-slate-500">
                        {type === 'club'
                          ? 'Select teams from the existing EP database.'
                          : 'Enter custom names for non-club fixtures.'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: Teams */}
            {!showPendingConfirm && step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="grid grid-cols-2 gap-4">

                  {/* Home team */}
                  <div className="space-y-2 relative">
                    <Label>Home Team (A)</Label>
                    {isClub ? (
                      <>
                        <Input
                          placeholder="Search team..."
                          value={teamASearch}
                          onChange={e => setTeamASearch(e.target.value)}
                        />
                        <div className="border rounded-md max-h-48 overflow-y-auto bg-white shadow-sm">
                          {filteredTeamA.length > 0 ? (
                            filteredTeamA.map(t => (
                              <div
                                key={t.id}
                                className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamAId === t.id ? 'bg-blue-100 font-semibold' : ''}`}
                                onClick={() => {
                                  updateField('teamAId', t.id);
                                  setTeamASearch(t.name);
                                  if (t?.homeGround) updateField('venue', t.homeGround);
                                }}
                              >
                                {t.name}
                              </div>
                            ))
                          ) : (
                            <div className="p-2 text-gray-500 text-sm">No teams found</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <Input
                        value={formData.teamAManual}
                        onChange={e => updateField('teamAManual', e.target.value)}
                        placeholder="Enter school/team name"
                      />
                    )}
                  </div>

                  {/* Away team */}
                  <div className="space-y-2 relative">
                    <Label>Away Team (B)</Label>
                    {isClub ? (
                      <>
                        <Input
                          placeholder="Search team..."
                          value={teamBSearch}
                          onChange={e => setTeamBSearch(e.target.value)}
                        />
                        <div className="border rounded-md max-h-48 overflow-y-auto bg-white shadow-sm">
                          {filteredTeamB.length > 0 ? (
                            filteredTeamB.map(t => (
                              <div
                                key={t.id}
                                className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamBId === t.id ? 'bg-blue-100 font-semibold' : ''}`}
                                onClick={() => {
                                  updateField('teamBId', t.id);
                                  setTeamBSearch(t.name);
                                }}
                              >
                                {t.name}
                              </div>
                            ))
                          ) : (
                            <div className="p-2 text-gray-500 text-sm">No teams found</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <Input
                        value={formData.teamBManual}
                        onChange={e => updateField('teamBManual', e.target.value)}
                        placeholder="Enter school/team name"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Logistics */}
            {!showPendingConfirm && step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={formData.matchDate}
                      onChange={e => updateField('matchDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time (24hr)</Label>
                    <div className="flex items-center gap-2">
                      <select
                        value={formData.matchTime ? formData.matchTime.split(':')[0] : '14'}
                        onChange={e => {
                          const mins = formData.matchTime ? formData.matchTime.split(':')[1] || '00' : '00';
                          updateField('matchTime', `${e.target.value}:${mins}`);
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {Array.from({ length: 24 }, (_, i) => {
                          const hour = i.toString().padStart(2, '0');
                          return <option key={hour} value={hour}>{hour}</option>;
                        })}
                      </select>
                      <span className="font-bold text-slate-500">:</span>
                      <select
                        value={formData.matchTime ? formData.matchTime.split(':')[1] || '00' : '00'}
                        onChange={e => {
                          const hrs = formData.matchTime ? formData.matchTime.split(':')[0] || '14' : '14';
                          updateField('matchTime', `${hrs}:${e.target.value}`);
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(min => (
                          <option key={min} value={min}>{min}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Venue / Ground</Label>
                  <Input
                    value={formData.venue}
                    onChange={e => updateField('venue', e.target.value)}
                    placeholder="Where is the match?"
                  />
                </div>
              </div>
            )}

            {/* STEP 4: Referee assignment */}
            {!showPendingConfirm && step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">

                {/* ── Banner for completing a pending fixture ─────────────────── */}
                {isCompletingPendingFixture && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-blue-800">
                        Completing pending fixture
                      </p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        Assigning a referee will complete this appointment and send a notification.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Status indicator ────────────────────────────────────────── */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between transition-all ${hasReferee
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {hasReferee ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold text-sm">
                        {hasReferee ? 'Ready to Complete' : 'No Referee Assigned Yet'}
                      </div>
                      <p className="text-xs opacity-80 mt-0.5">
                        {hasReferee
                          ? 'Referee assigned — submit to finalise and notify.'
                          : 'Assign a referee below, or save as a pending fixture to return later.'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${hasReferee
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                  >
                    {hasReferee ? 'Ready' : 'Pending'}
                  </span>
                </div>

                {/* ── Official role selector ──────────────────────────────────── */}
                <div className="space-y-2">
                  <Label>Official Role</Label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={selectedRole}
                    onChange={e => {
                      setSelectedRole(e.target.value);
                      updateField('officialRole', e.target.value);
                    }}
                  >
                    {officialRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                {/* ── Referee search ──────────────────────────────────────────── */}
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <Label>Assign {selectedRole} (Optional)</Label>
                    {hasReferee && (
                      <button
                        type="button"
                        onClick={() => handleRefereeSelect(null)}
                        className="text-xs text-rose-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <UserX className="w-3 h-3" /> Clear / Unassign
                      </button>
                    )}
                  </div>

                  <Input
                    placeholder={`Search ${selectedRole.toLowerCase()} or save as pending…`}
                    value={refereeSearch}
                    onChange={e => setRefereeSearch(e.target.value)}
                  />

                  <div className="border rounded-md max-h-48 overflow-y-auto bg-white shadow-sm">
                    {/* Skip option */}
                    <div
                      className={`p-2.5 cursor-pointer hover:bg-amber-50 border-b text-amber-900 flex items-center justify-between ${!formData.refereeId ? 'bg-amber-100 font-semibold' : ''
                        }`}
                      onClick={() => handleRefereeSelect(null)}
                    >
                      <span className="text-xs font-bold">Skip / Save as Pending Fixture</span>
                      <span className="text-[10px] bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded font-medium">
                        Assign later
                      </span>
                    </div>

                    {filteredReferees.map(r => (
                      <div
                        key={r.id}
                        className={`p-2 cursor-pointer hover:bg-gray-100 text-xs ${formData.refereeId === r.id ? 'bg-emerald-100 font-semibold text-emerald-900' : ''
                          }`}
                        onClick={() => handleRefereeSelect(r)}
                      >
                        {resolveName(r)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Notes ──────────────────────────────────────────────────── */}
                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={e => updateField('notes', e.target.value)}
                    placeholder="Kit colors, parking info, etc."
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Footer Navigation ─────────────────────────────────────────────── */}
          {!showPendingConfirm && (
            <div className="flex items-center justify-between p-6 bg-slate-50 border-t shrink-0">
              <Button
                variant="outline"
                onClick={() => (step === 1 ? onOpenChange(false) : setStep(step - 1))}
              >
                {step === 1 ? 'Cancel' : <><ChevronLeft className="mr-2 h-4 w-4" /> Back</>}
              </Button>

              {step < 4 ? (
                <Button
                  className="bg-[#006747] hover:bg-[#004d35]"
                  disabled={!validateStep()}
                  onClick={() => setStep(step + 1)}
                >
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className={`px-8 font-bold transition-all ${hasReferee
                    ? 'bg-[#006747] hover:bg-[#004d35] text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  disabled={loading}
                  onClick={handleSaveClick}
                >
                  {loading ? (
                    <Loader2 className="animate-spin w-4 h-4 mr-2" />
                  ) : null}
                  {editData
                    ? hasReferee
                      ? isCompletingPendingFixture ? 'Complete & Notify Referee' : 'Save Changes'
                      : 'Save as Pending'
                    : hasReferee
                      ? 'Complete Appointment'
                      : 'Save as Pending Fixture'}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Soft conflict modal ────────────────────────────────────────────────── */}
      <Dialog open={showSoftConflictModal} onOpenChange={setShowSoftConflictModal}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Referee Already Appointed
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">
                {pendingRefereeSelection ? resolveName(pendingRefereeSelection) : 'This referee'}
              </strong>{' '}
              is already appointed to another match on{' '}
              <strong className="text-slate-900">{formData.matchDate}</strong>.
            </p>
            {conflictingAppointment && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2 text-sm text-amber-900">
                <div className="font-bold text-slate-800">
                  {conflictingAppointment.matchTitle ||
                    `${conflictingAppointment.homeTeam} vs ${conflictingAppointment.awayTeam}`}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Calendar className="h-3.5 w-3.5" />
                  {conflictingAppointment.matchDate || conflictingAppointment.date}
                  <Clock className="h-3.5 w-3.5 ml-2" />
                  {conflictingAppointment.matchTime || conflictingAppointment.time}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <MapPin className="h-3.5 w-3.5" />
                  {conflictingAppointment.venue || 'N/A'}
                </div>
              </div>
            )}
            <p className="text-sm text-slate-600">Do you still want to proceed?</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowSoftConflictModal(false);
                setPendingRefereeSelection(null);
                setConflictingAppointment(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#006747] hover:bg-[#004d35]"
              onClick={() => {
                if (pendingRefereeSelection) applyRefereeSelection(pendingRefereeSelection);
                setShowSoftConflictModal(false);
                setPendingRefereeSelection(null);
                setConflictingAppointment(null);
              }}
            >
              Proceed Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Hard conflict modal ────────────────────────────────────────────────── */}
      <Dialog open={showHardConflictModal} onOpenChange={setShowHardConflictModal}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Referee Double-Booked
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">
                {pendingRefereeSelection ? resolveName(pendingRefereeSelection) : 'This referee'}
              </strong>{' '}
              cannot be appointed — already booked at exactly{' '}
              <strong className="text-slate-900">{formData.matchTime}</strong>.
            </p>
            {conflictingAppointment && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2 text-sm text-red-900">
                <div className="font-bold text-slate-800">
                  {conflictingAppointment.matchTitle ||
                    `${conflictingAppointment.homeTeam} vs ${conflictingAppointment.awayTeam}`}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Calendar className="h-3.5 w-3.5" />
                  {conflictingAppointment.matchDate || conflictingAppointment.date}
                  <Clock className="h-3.5 w-3.5 ml-2 text-red-600" />
                  {conflictingAppointment.matchTime || conflictingAppointment.time}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <MapPin className="h-3.5 w-3.5" />
                  {conflictingAppointment.venue || 'N/A'}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
              onClick={() => {
                setShowHardConflictModal(false);
                setPendingRefereeSelection(null);
                setConflictingAppointment(null);
              }}
            >
              OK — Choose Another Referee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreateAppointmentDialog;