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
  Clock, MapPin, Calendar, CheckCircle2, Flag, ArrowLeft, UserCheck, X
} from 'lucide-react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
  homeGround?: string;
}

interface PersonOption {
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
  coachId?: string;
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
  const [referees, setReferees] = useState<PersonOption[]>([]);
  const [coaches, setCoaches] = useState<PersonOption[]>([]);
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
    coachId: '', // Optional Coach appointment
    notes: ''
  });

  // Conflict modal states
  const [showSoftConflictModal, setShowSoftConflictModal] = useState(false);
  const [showHardConflictModal, setShowHardConflictModal] = useState(false);
  const [conflictingAppointment, setConflictingAppointment] = useState<Appointment | null>(null);
  const [pendingRefereeSelection, setPendingRefereeSelection] = useState<PersonOption | null>(null);

  // Pending confirmation state (when saving without a referee)
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
  const hasCoach = !!formData.coachId;

  const isCompletingPendingFixture =
    editData?.status === 'pending_assignment' && !editData?.refereeId;

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
        const [teamsSnap, refUsersSnap, refereesSnap, coachUsersSnap, coachesSnap, apptsSnap] =
          await Promise.all([
            getDocs(collection(db, 'teams')),
            getDocs(query(collection(db, 'users'), where('role', '==', 'referee'))),
            getDocs(collection(db, 'referees')),
            getDocs(query(collection(db, 'users'), where('role', '==', 'coach'))),
            getDocs(collection(db, 'coaches')),
            getDocs(collection(db, 'appointments')),
          ]);

        setTeams(teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));

        const apptsList: Appointment[] = apptsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Appointment))
          .filter(a => a.status !== 'cancelled' && a.status !== 'rejected');
        setExistingAppointments(apptsList);

        const getDisplayName = (data: any) =>
          data.full_name || data.fullName || data.displayName || data.name || data.email || 'Unnamed';
        const normalizeEmail = (s: string) => (s || '').trim().toLowerCase();

        // Merge & deduplicate Referees (strictly role === 'referee' or from referees collection without coach/exec role)
        const refByEmail = new Map<string, any>();
        [...refUsersSnap.docs, ...refereesSnap.docs].forEach(d => {
          const data = d.data();
          const role = (data.role || 'referee').toLowerCase();
          if (role !== 'referee') return;

          const email = normalizeEmail(data.email);
          const key = email || d.id;
          refByEmail.set(key, {
            id: data.uid || d.id,
            ...data,
            email,
            displayName: getDisplayName(data),
          });
        });
        setReferees(Array.from(refByEmail.values()));

        // Merge & deduplicate Coaches ONLY (strictly role === 'coach', exclude referees/executives)
        const coachByEmail = new Map<string, any>();

        // 1. Authoritative users with role === 'coach'
        coachUsersSnap.docs.forEach(d => {
          const data = d.data();
          const role = (data.role || '').toLowerCase();
          if (role !== 'coach' || data.isExecutive === true) return;

          const email = normalizeEmail(data.email);
          const key = email || d.id;
          coachByEmail.set(key, {
            id: data.uid || d.id,
            ...data,
            email,
            displayName: getDisplayName(data),
          });
        });

        // 2. Legacy `coaches` collection — only include if role is missing or explicitly 'coach'
        coachesSnap.docs.forEach(d => {
          const data = d.data();
          const role = (data.role || 'coach').toLowerCase();
          if (role !== 'coach' || data.isExecutive === true) return;

          const email = normalizeEmail(data.email);
          const key = email || d.id;
          // Don't overwrite if already loaded from `users` with canonical UID
          if (!coachByEmail.has(key)) {
            coachByEmail.set(key, {
              id: data.uid || d.id,
              ...data,
              email,
              displayName: getDisplayName(data),
            });
          }
        });

        setCoaches(
          Array.from(coachByEmail.values()).sort((a, b) =>
            resolveName(a).localeCompare(resolveName(b))
          )
        );

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
            coachId: editData.coachId || '',
            notes: editData.notes || ''
          });
          setSelectedRole(editData.officialRole || 'Referee');
          if (editData.refereeName) setRefereeSearch(editData.refereeName);
          if (editData.homeTeam) setTeamASearch(editData.homeTeam);
          if (editData.awayTeam) setTeamBSearch(editData.awayTeam);

          if (isCompletingPendingFixture || !editData.coachId) setStep(4);
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
            coachId: '',
            notes: ''
          });
          setRefereeSearch('');
          setTeamASearch('');
          setTeamBSearch('');
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

  const handleRefereeSelect = (referee: PersonOption | null) => {
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

  const applyRefereeSelection = (referee: PersonOption) => {
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

  // ─── Save-click interceptor ───────────────────────────────────────────────────
  const handleSaveClick = () => {
    if (!hasReferee) {
      setShowPendingConfirm(true);
      return;
    }
    handleSubmit();
  };

  // ─── Sync Coach Appointment Document (triggers Coach Popup Modal) ────────────
  const syncCoachAppointment = async (
    matchDocId: string,
    matchTitle: string,
    assignedCoach: PersonOption | null,
    assignedRef: PersonOption | null
  ) => {
    try {
      const existingCoachAppts = await getDocs(
        query(collection(db, 'coachAppointments'), where('matchId', '==', matchDocId))
      );

      // Case 1: Coach was removed/skipped during edit -> remove pending coach appointment
      if (!assignedCoach) {
        for (const d of existingCoachAppts.docs) {
          if (d.data().status === 'pending') {
            await deleteDoc(doc(db, 'coachAppointments', d.id));
          }
        }
        return;
      }

      const coachName = resolveName(assignedCoach);
      const refName = assignedRef ? resolveName(assignedRef) : 'Unassigned Referee';

      const coachApptData = {
        coachId: assignedCoach.id,
        coachName,
        coachEmail: assignedCoach.email || null,
        refereeId: assignedRef?.id || '',
        refereeName: refName,
        refereeEmail: assignedRef?.email || '',
        match: matchTitle,
        matchDate: formData.matchDate,
        kickoffTime: formData.matchTime,
        venue: formData.venue || '',
        level: formData.competitionName || formData.competitionType || formData.teamLevel || 'Club',
        matchId: matchDocId,
        appointedBy: profile?.full_name || user?.displayName || 'Executive',
        updatedAt: serverTimestamp(),
      };

      if (!existingCoachAppts.empty) {
        const existingDoc = existingCoachAppts.docs[0];
        const prevCoachId = existingDoc.data().coachId;
        // If Exco switched to a different coach, reset status to 'pending' so new coach gets the popup
        await updateDoc(doc(db, 'coachAppointments', existingDoc.id), {
          ...coachApptData,
          ...(prevCoachId !== assignedCoach.id ? { status: 'pending' } : {}),
        });
      } else {
        await addDoc(collection(db, 'coachAppointments'), {
          ...coachApptData,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn('syncCoachAppointment warning:', err);
    }
  };

  // ─── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const validRefereeId = formData.refereeId?.trim() || null;
      const validCoachId = formData.coachId?.trim() || null;
      const isAssigned = Boolean(validRefereeId);

      const selectedTeamA = teams.find(t => t.id === formData.teamAId);
      const selectedTeamB = teams.find(t => t.id === formData.teamBId);
      const assignedRef = isAssigned ? referees.find(r => r.id === validRefereeId) || null : null;
      const assignedCoach = validCoachId ? coaches.find(c => c.id === validCoachId) || null : null;

      const homeName = isClub ? (selectedTeamA?.name || '') : (formData.teamAManual || '');
      const awayName = isClub ? (selectedTeamB?.name || '') : (formData.teamBManual || '');
      const matchTitle = `${homeName} vs ${awayName}`;

      const calculatedStatus = isAssigned ? 'pending' : 'pending_assignment';

      const appointmentPayload = {
        competitionType: formData.competitionType || '',
        competition: formData.competitionName || formData.competitionType || '',
        competitionName: formData.competitionName || '',

        homeTeamId: formData.teamAId || null,
        awayTeamId: formData.teamBId || null,
        homeTeam: homeName,
        awayTeam: awayName,
        matchTitle,

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

        // Coach assignment fields (recorded on fixture for Exco dashboard visibility)
        coachId: validCoachId,
        coachName: assignedCoach ? resolveName(assignedCoach) : null,
        coachEmail: assignedCoach?.email || null,

        teamLevel: formData.teamLevel || 'main',
        appointedById: profile?.id || user?.uid || null,
        appointedByName: profile?.full_name || profile?.displayName || user?.displayName || 'Executive',

        status: calculatedStatus,
        updatedAt: serverTimestamp(),
      };

      const currentTimestamp = new Date().toISOString();

      if (editData?.id) {
        const auditEntry = {
          action: isAssigned && !editData.refereeId ? 'completed' : 'edited',
          by: user?.uid || 'unknown',
          byName: user?.displayName || user?.email || 'Executive',
          byRole: 'executive',
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
            oldCoach: editData.coachName || 'Unassigned',
            newCoach: assignedCoach ? resolveName(assignedCoach) : 'Unassigned',
            oldOfficialRole: editData.officialRole || '',
            newOfficialRole: formData.officialRole || '',
            statusChange: `${editData.status || 'pending_assignment'} → ${calculatedStatus}`,
          }
        };

        await updateDoc(doc(db, 'appointments', editData.id), {
          ...appointmentPayload,
          auditTrail: [...(editData.auditTrail || []), auditEntry]
        });

        // Sync coach appointment popup record
        await syncCoachAppointment(editData.id, matchTitle, assignedCoach, assignedRef);

        // Notification when referee newly assigned
        if (!editData.refereeId && validRefereeId && assignedRef) {
          try {
            await addDoc(collection(db, 'notifications'), {
              type: 'appointment_assigned',
              recipientId: validRefereeId,
              recipientEmail: assignedRef.email || null,
              recipientName: resolveName(assignedRef),
              appointmentId: editData.id,
              matchTitle,
              matchDate: formData.matchDate,
              matchTime: formData.matchTime,
              venue: formData.venue,
              competition: formData.competitionType || '',
              officialRole: formData.officialRole || 'Referee',
              sentBy: user?.displayName || user?.email || 'Executive',
              sentByUid: user?.uid || null,
              createdAt: serverTimestamp(),
              read: false,
            });
          } catch (notifErr) {
            console.warn('Notification write failed (non-blocking):', notifErr);
          }
        }

        toast({
          title: 'Appointment Updated',
          description: assignedCoach
            ? `Fixture saved & Coach ${resolveName(assignedCoach)} notified.`
            : 'Fixture updated (no coach assigned).',
        });

      } else {
        const newDocRef = await addDoc(collection(db, 'appointments'), {
          ...appointmentPayload,
          createdAt: serverTimestamp(),
          auditTrail: [{
            action: 'created',
            by: user?.uid || 'unknown',
            byName: user?.displayName || user?.email || 'Executive',
            byRole: 'executive',
            timestamp: currentTimestamp,
            details: {
              referee: assignedRef ? resolveName(assignedRef) : 'Unassigned',
              coach: assignedCoach ? resolveName(assignedCoach) : 'Skipped',
            }
          }]
        });

        // Create coach appointment popup record if a coach was selected
        if (assignedCoach) {
          await syncCoachAppointment(newDocRef.id, matchTitle, assignedCoach, assignedRef);
        }

        toast({
          title: isAssigned ? 'Appointment Created' : '⏳ Fixture Saved as Pending',
          description: assignedCoach
            ? `Match created & Coach ${resolveName(assignedCoach)} appointed.`
            : isAssigned
              ? 'Match scheduled (coach appointment skipped — you can assign a coach anytime).'
              : 'Fixture saved without referee/coach. Complete it later from your dashboard.',
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
  const filteredReferees = referees.filter(r =>
    resolveName(r).toLowerCase().includes(refereeSearch.toLowerCase())
  );

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
                  : <><Shield size={20} /> Edit Appointment & Officials</>
              ) : (
                <><Trophy size={20} /> Create New Appointment</>
              )}
            </DialogTitle>
            {editData && !showPendingConfirm && (
              <p className="text-xs text-white/80 mt-1">
                Update match details, referee assignment, or appoint/change a match coach
              </p>
            )}
          </DialogHeader>

          {/* ── Step progress bar ──────────────────────────────────────────────── */}
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

          {/* ── Body ───────────────────────────────────────────────────────────── */}
          <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
            {fetchingData ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
                <Loader2 className="animate-spin text-[#006747]" size={28} />
                <span className="text-sm">Loading teams, referees, and coaches...</span>
              </div>
            ) : showPendingConfirm ? (
              /* ═══ PENDING CONFIRMATION VIEW ═══ */
              <div className="flex flex-col items-center gap-5 py-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <Flag className="w-8 h-8 text-amber-600" />
                </div>

                <div className="text-center">
                  <h3 className="text-lg font-black text-slate-800">
                    Save Without a Referee?
                  </h3>
                  <p className="text-sm text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                    No referee has been assigned. This fixture will be saved as{' '}
                    <span className="font-bold text-amber-700 uppercase tracking-wide">Pending</span>.
                    You can assign a referee or coach at any time from your dashboard.
                  </p>
                </div>

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
                    {hasCoach && (
                      <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                        <UserCheck className="w-3 h-3" />
                        Coach: {resolveName(coaches.find(c => c.id === formData.coachId))}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col w-full gap-2.5">
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white w-full font-bold h-11"
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
                    Continue — Save as Pending Fixture
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-11"
                    onClick={() => setShowPendingConfirm(false)}
                    disabled={loading}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back — Assign a Referee Now
                  </Button>

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
            ) : (
              <>
                {/* STEP 1: Competition Type */}
                {step === 1 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <Label className="text-lg font-bold">Select Competition Category</Label>
                    <div className="grid grid-cols-1 gap-4">
                      {['club', 'school', 'tournament'].map(type => (
                        <button
                          key={type}
                          type="button"
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
                {step === 2 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                    className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamAId === t.id ? 'bg-emerald-50 font-semibold text-[#006747]' : ''
                                      }`}
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
                                    className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamBId === t.id ? 'bg-emerald-50 font-semibold text-[#006747]' : ''
                                      }`}
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
                {step === 3 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {['00', '15', '30', '45'].map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Venue / Field</Label>
                      <Input
                        placeholder="e.g. Nelson Mandela Bay Stadium / KruisFontein"
                        value={formData.venue}
                        onChange={e => updateField('venue', e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 4: Referee & Optional Coach Appointment */}
                {step === 4 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    {/* 1. Referee Appointment */}
                    <div className="space-y-3 p-4 rounded-xl border bg-slate-50/70">
                      <div className="flex items-center justify-between">
                        <Label className="font-bold text-slate-800">Assign Referee</Label>
                        {hasReferee && (
                          <button
                            type="button"
                            onClick={() => handleRefereeSelect(null)}
                            className="text-xs text-red-600 hover:underline flex items-center gap-1"
                          >
                            <X size={12} /> Clear Referee
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-slate-500">Official Role</Label>
                          <select
                            value={selectedRole}
                            onChange={e => {
                              setSelectedRole(e.target.value);
                              updateField('officialRole', e.target.value);
                            }}
                            className="mt-1 flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                          >
                            {officialRoles.map(role => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label className="text-xs text-slate-500">Search Referee</Label>
                          <Input
                            className="mt-1 bg-white"
                            placeholder="Type referee name..."
                            value={refereeSearch}
                            onChange={e => setRefereeSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="border rounded-md max-h-36 overflow-y-auto bg-white">
                        {filteredReferees.length > 0 ? (
                          filteredReferees.map(r => (
                            <div
                              key={r.id}
                              onClick={() => handleRefereeSelect(r)}
                              className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-emerald-50 ${formData.refereeId === r.id ? 'bg-emerald-100 font-bold text-[#006747]' : ''
                                }`}
                            >
                              <span>{resolveName(r)}</span>
                              {formData.refereeId === r.id && (
                                <CheckCircle2 size={15} className="text-[#006747]" />
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-xs text-slate-500">No referees found</div>
                        )}
                      </div>
                    </div>

                    {/* 2. Optional Coach Appointment Dropdown + Skip Option */}
                    <div className="space-y-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="font-bold text-[#006747] flex items-center gap-1.5">
                            <UserCheck size={16} /> Appoint Match Coach (Optional)
                          </Label>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Select a coach to evaluate the referee, or skip and assign one later.
                          </p>
                        </div>

                        {hasCoach && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => updateField('coachId', '')}
                            className="text-xs text-amber-700 hover:bg-amber-100 h-8"
                          >
                            Skip Coach
                          </Button>
                        )}
                      </div>

                      <select
                        value={formData.coachId}
                        onChange={e => updateField('coachId', e.target.value)}
                        className="flex h-10 w-full rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006747]"
                      >
                        <option value="">— Skip Coach Appointment (Assign Later) —</option>
                        {coaches.map(c => (
                          <option key={c.id} value={c.id}>
                            {resolveName(c)} {c.email ? `(${c.email})` : ''}
                          </option>
                        ))}
                      </select>

                      {hasCoach ? (
                        <div className="text-xs text-emerald-800 bg-emerald-100/80 px-3 py-1.5 rounded-md flex items-center gap-1.5">
                          <CheckCircle2 size={14} />
                          <span>
                            <strong>{resolveName(coaches.find(c => c.id === formData.coachId))}</strong> will receive a popup acceptance alert on their dashboard.
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">
                          Coach appointment skipped — you can edit this fixture later to add a coach.
                        </div>
                      )}
                    </div>

                    {/* 3. Notes */}
                    <div className="space-y-2">
                      <Label>Appointment Notes / Instructions</Label>
                      <Textarea
                        rows={3}
                        placeholder="Optional message to referee and coach..."
                        value={formData.notes}
                        onChange={e => updateField('notes', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Pinned Footer ──────────────────────────────────────────────────── */}
          {!showPendingConfirm && (
            <DialogFooter className="p-4 sm:p-6 border-t bg-slate-50 flex items-center justify-between gap-2 shrink-0">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(s => s - 1)}
                  disabled={loading}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
              ) : (
                <div />
              )}

              {step < 4 ? (
                <Button
                  type="button"
                  onClick={() => setStep(s => s + 1)}
                  disabled={!validateStep()}
                  className="bg-[#006747] hover:bg-[#004d35] text-white"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={loading}
                  className="bg-[#006747] hover:bg-[#004d35] text-white font-bold"
                >
                  {loading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
                  {editData
                    ? 'Save Changes'
                    : hasReferee
                      ? hasCoach
                        ? 'Save & Appoint Officials'
                        : 'Save Appointment (Skip Coach)'
                      : 'Continue Without Referee'}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Soft Conflict Modal ────────────────────────────────────────────────── */}
      <Dialog open={showSoftConflictModal} onOpenChange={setShowSoftConflictModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle size={20} /> Same-Day Appointment Warning
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            <strong>{resolveName(pendingRefereeSelection)}</strong> already has a match on{' '}
            <strong>{formData.matchDate}</strong> ({conflictingAppointment?.homeTeam} vs{' '}
            {conflictingAppointment?.awayTeam} at{' '}
            {conflictingAppointment?.matchTime || conflictingAppointment?.time}). Assign anyway?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSoftConflictModal(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (pendingRefereeSelection) applyRefereeSelection(pendingRefereeSelection);
                setShowSoftConflictModal(false);
              }}
            >
              Assign Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Hard Conflict Modal ────────────────────────────────────────────────── */}
      <Dialog open={showHardConflictModal} onOpenChange={setShowHardConflictModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={20} /> Double-Booking Conflict
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            <strong>{resolveName(pendingRefereeSelection)}</strong> is already appointed at the exact
            same date and time ({formData.matchDate} @ {formData.matchTime}). Please select a
            different referee or change the kickoff time.
          </p>
          <DialogFooter>
            <Button onClick={() => setShowHardConflictModal(false)}>Choose Another Referee</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreateAppointmentDialog;