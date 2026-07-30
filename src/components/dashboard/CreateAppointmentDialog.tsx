import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import {
  Loader2, Shield, Trophy, ChevronLeft, ChevronRight, AlertTriangle, Clock, MapPin, Calendar
} from 'lucide-react';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

const CreateAppointmentDialog: React.FC<Props> = ({ open, onOpenChange, onCreated, editData }) => {
  const { user, profile } = useAuth() as any;

  // Data States
  const [teams, setTeams] = useState<Team[]>([]);
  const [referees, setReferees] = useState<RefereeOption[]>([]);
  const [existingAppointments, setExistingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [step, setStep] = useState(1);

  // Form States
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
    officialRole: "Referee",
    notes: ''
  });

  // Conflict Modal States
  const [showSoftConflictModal, setShowSoftConflictModal] = useState(false);
  const [showHardConflictModal, setShowHardConflictModal] = useState(false);
  const [conflictingAppointment, setConflictingAppointment] = useState<Appointment | null>(null);
  const [pendingRefereeSelection, setPendingRefereeSelection] = useState<RefereeOption | null>(null);

  const isClub = formData.competitionType === 'club';

  const [teamASearch, setTeamASearch] = useState("");
  const [teamBSearch, setTeamBSearch] = useState("");
  const [refereeSearch, setRefereeSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("referee");

  const officialRoles = [
    "Referee",
    "Assistant Referee",
    "1st Reserve",
    "2nd Team",
    "4th Official",
    "5th Official",
  ];

  // ─── Initialization ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      setFetchingData(true);
      try {
        const [teamsSnap, usersSnap, refereesSnap, apptsSnap] = await Promise.all([
          getDocs(collection(db, 'teams')),
          getDocs(query(collection(db, 'users'), where('role', '==', 'referee'))),
          getDocs(collection(db, 'referees')),
          getDocs(collection(db, 'appointments')), // Load active appointments to check conflicts
        ]);

        setTeams(teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));

        // Load active/non-cancelled appointments
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
          byEmail.set(email, {
            id: d.id,
            ...data,
            email,
            displayName: getDisplayName(data),
          });
        });

        refereesSnap.docs.forEach(d => {
          const data = d.data();
          const email = normalizeEmail(data.email);
          if (!email) return;
          byEmail.set(email, {
            id: d.id,
            ...data,
            email,
            displayName: getDisplayName(data),
          });
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
        }
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setFetchingData(false);
      }
    };
    fetchData();
  }, [open, editData]);

  // ─── Conflict Check Handler ────────────────────────────────────────────────

  const handleRefereeSelect = (referee: RefereeOption | null) => {
    if (!referee) {
      updateField("refereeId", "");
      setRefereeSearch("");
      return;
    }

    // Ignore current match if in Edit Mode
    const otherAppointments = existingAppointments.filter(
      a => !editData || a.id !== editData.id
    );

    // Find appointments for this referee on the selected matchDate
    const assignedMatchOnSameDay = otherAppointments.find(a => {
      const matchDate = a.matchDate || a.date;
      return a.refereeId === referee.id && matchDate === formData.matchDate;
    });

    if (assignedMatchOnSameDay) {
      const existingTime = assignedMatchOnSameDay.matchTime || assignedMatchOnSameDay.time;
      const newTime = formData.matchTime;

      // RULE 1: Double booking (Same Date & Same Time) -> Rejection
      if (existingTime === newTime) {
        setConflictingAppointment(assignedMatchOnSameDay);
        setPendingRefereeSelection(referee);
        setShowHardConflictModal(true);
        return;
      }

      // RULE 2: Same Date, Different Time -> Confirmation Dialog
      setConflictingAppointment(assignedMatchOnSameDay);
      setPendingRefereeSelection(referee);
      setShowSoftConflictModal(true);
      return;
    }

    // No conflicts -> Proceed normally
    applyRefereeSelection(referee);
  };

  const applyRefereeSelection = (referee: RefereeOption) => {
    updateField("refereeId", referee.id);
    updateField("officialRole", selectedRole);
    setRefereeSearch(resolveName(referee));
  };

  // ─── Logic ──────────────────────────────────────────────────────────────────

  const validateStep = () => {
    switch (step) {
      case 1: return !!formData.competitionType;
      case 2:
        if (isClub) return !!formData.teamAId && !!formData.teamBId;
        return !!formData.teamAManual && !!formData.teamBManual;
      case 3: return !!formData.matchDate && !!formData.matchTime && !!formData.venue;
      default: return true;
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const selectedTeamA = teams.find(t => t.id === formData.teamAId);
      const selectedTeamB = teams.find(t => t.id === formData.teamBId);
      const assignedRef = referees.find(r => r.id === formData.refereeId);

      const homeName = isClub ? selectedTeamA?.name || '' : formData.teamAManual;
      const awayName = isClub ? selectedTeamB?.name || '' : formData.teamBManual;

      const appointmentPayload = {
        competitionType: formData.competitionType,
        competition: formData.competitionName || formData.competitionType,
        competitionName: formData.competitionName || '',

        homeTeamId: formData.teamAId || null,
        awayTeamId: formData.teamBId || null,
        homeTeam: homeName,
        awayTeam: awayName,
        matchTitle: `${homeName} vs ${awayName}`,

        matchDate: formData.matchDate,
        matchTime: formData.matchTime,
        venue: formData.venue,
        notes: formData.notes || '',

        date: formData.matchDate,
        time: formData.matchTime,
        role: formData.officialRole || formData.refereeRole || 'Referee',

        refereeId: formData.refereeId || null,
        refereeName: assignedRef ? resolveName(assignedRef) : null,
        refereeEmail: assignedRef?.email || null,
        refereeRole: formData.refereeRole || 'referee',
        officialRole: formData.officialRole || 'Referee',

        teamLevel: formData.teamLevel || 'main',
        coachId: profile?.id || user?.uid,
        coachName: profile?.firstName || profile?.displayName || user?.displayName || 'Coach',
        coachEmail: profile?.email || user?.email || null,

        updatedAt: serverTimestamp(),
      };

      if (editData?.id) {
        const auditEntry = {
          action: 'edited',
          by: user?.uid || 'unknown',
          byName: user?.displayName || user?.email || 'Coach',
          byRole: 'coach',
          timestamp: new Date().toISOString(),
          details: {
            oldHomeTeam: editData.homeTeam,
            newHomeTeam: homeName,
            oldAwayTeam: editData.awayTeam,
            newAwayTeam: awayName,
            oldVenue: editData.venue,
            newVenue: formData.venue,
            oldDate: editData.matchDate,
            newDate: formData.matchDate,
            oldTime: editData.matchTime,
            newTime: formData.matchTime,
            oldReferee: editData.refereeName || 'Unassigned',
            newReferee: assignedRef ? resolveName(assignedRef) : 'Unassigned',
            oldOfficialRole: editData.officialRole || 'Referee',
            newOfficialRole: formData.officialRole,
          }
        };

        await updateDoc(doc(db, 'appointments', editData.id), {
          ...appointmentPayload,
          auditTrail: [...(editData.auditTrail || []), auditEntry]
        });

        toast({ title: "Appointment Updated", description: "All match details were updated successfully." });
      } else {
        await addDoc(collection(db, 'appointments'), {
          ...appointmentPayload,
          status: 'pending',
          createdAt: serverTimestamp(),
          auditTrail: [{
            action: 'created',
            by: user?.uid || 'unknown',
            byName: user?.displayName || user?.email || 'Coach',
            byRole: 'coach',
            timestamp: new Date().toISOString(),
          }]
        });

        toast({ title: "Appointment Created", description: "The match appointment has been created successfully." });
      }

      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Appointment save error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredTeamA = teams.filter((t) => t.name.toLowerCase().includes(teamASearch.toLowerCase()));
  const filteredTeamB = teams.filter((t) => t.name.toLowerCase().includes(teamBSearch.toLowerCase()));
  const filteredReferees = referees.filter((r) => resolveName(r).toLowerCase().includes(refereeSearch.toLowerCase()));

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-white">
          <DialogHeader className="bg-[#006747] p-6 text-white">
            <DialogTitle className="flex items-center gap-2 text-xl">
              {editData ? <Shield size={20} /> : <Trophy size={20} />}
              {editData ? 'Edit Appointment' : 'Create New Appointment'}
            </DialogTitle>
          </DialogHeader>

          {/* Step Indicator */}
          <div className="flex border-b">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`flex-1 h-1.5 ${step >= s ? 'bg-[#006747]' : 'bg-slate-100'}`} />
            ))}
          </div>

          <div className="p-8 min-h-[400px]">
            {/* STEP 1: Type Selection */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <Label className="text-lg font-bold">Select Competition Category</Label>
                <div className="grid grid-cols-1 gap-4">
                  {['club', 'school', 'tournament'].map((type) => (
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
                        {type === 'club' ? 'Select teams from the existing EP database.' : 'Enter custom names for non-club fixtures.'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: Team Selection */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* HOME TEAM */}
                  <div className="space-y-2 relative">
                    <Label>Home Team (A)</Label>
                    {isClub ? (
                      <>
                        <Input
                          placeholder="Search team..."
                          value={teamASearch}
                          onChange={(e) => setTeamASearch(e.target.value)}
                        />
                        <div className="border rounded-md max-h-48 overflow-y-auto bg-white shadow-sm">
                          {filteredTeamA.length > 0 ? (
                            filteredTeamA.map((t) => (
                              <div
                                key={t.id}
                                className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamAId === t.id ? "bg-blue-100 font-semibold" : ""
                                  }`}
                                onClick={() => {
                                  updateField("teamAId", t.id);
                                  setTeamASearch(t.name);
                                  if (t?.homeGround) updateField("venue", t.homeGround);
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
                        onChange={(e) => updateField("teamAManual", e.target.value)}
                        placeholder="Enter school/team name"
                      />
                    )}
                  </div>

                  {/* AWAY TEAM */}
                  <div className="space-y-2 relative">
                    <Label>Away Team (B)</Label>
                    {isClub ? (
                      <>
                        <Input
                          placeholder="Search team..."
                          value={teamBSearch}
                          onChange={(e) => setTeamBSearch(e.target.value)}
                        />
                        <div className="border rounded-md max-h-48 overflow-y-auto bg-white shadow-sm">
                          {filteredTeamB.length > 0 ? (
                            filteredTeamB.map((t) => (
                              <div
                                key={t.id}
                                className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamBId === t.id ? "bg-blue-100 font-semibold" : ""
                                  }`}
                                onClick={() => {
                                  updateField("teamBId", t.id);
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
                        onChange={(e) => updateField("teamBManual", e.target.value)}
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={formData.matchDate}
                      onChange={(e) => updateField('matchDate', e.target.value)}
                    />
                  </div>

                  {/* 24-Hour Time Selector */}
                  <div className="space-y-2">
                    <Label>Time (24hr)</Label>
                    <div className="flex items-center gap-2">
                      <select
                        value={formData.matchTime ? formData.matchTime.split(':')[0] : '14'}
                        onChange={(e) => {
                          const mins = formData.matchTime ? formData.matchTime.split(':')[1] || '00' : '00';
                          updateField('matchTime', `${e.target.value}:${mins}`);
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {Array.from({ length: 24 }, (_, i) => {
                          const hour = i.toString().padStart(2, '0');
                          return (
                            <option key={hour} value={hour}>
                              {hour}
                            </option>
                          );
                        })}
                      </select>

                      <span className="font-bold text-slate-500">:</span>

                      <select
                        value={formData.matchTime ? formData.matchTime.split(':')[1] || '00' : '00'}
                        onChange={(e) => {
                          const hrs = formData.matchTime ? formData.matchTime.split(':')[0] || '14' : '14';
                          updateField('matchTime', `${hrs}:${e.target.value}`);
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((min) => (
                          <option key={min} value={min}>
                            {min}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Venue / Ground</Label>
                  <Input
                    value={formData.venue}
                    onChange={(e) => updateField('venue', e.target.value)}
                    placeholder="Where is the match?"
                  />
                </div>
              </div>
            )}

            {/* STEP 4: Assignment */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="space-y-2">
                  <Label>Official Role</Label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={selectedRole}
                    onChange={(e) => {
                      const role = e.target.value;
                      setSelectedRole(role);
                      updateField("officialRole", role);
                    }}
                  >
                    {officialRoles.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                {/* REFEREE SEARCH */}
                <div className="space-y-2 relative">
                  <Label>Assign {selectedRole}</Label>

                  <Input
                    placeholder={`Search ${selectedRole.toLowerCase()}...`}
                    value={refereeSearch}
                    onChange={(e) => setRefereeSearch(e.target.value)}
                  />

                  <div className="border rounded-md max-h-48 overflow-y-auto bg-white shadow-sm">
                    <div
                      className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.refereeId === "" ? "bg-blue-100 font-semibold" : ""
                        }`}
                      onClick={() => handleRefereeSelect(null)}
                    >
                      Leave Unassigned
                    </div>

                    {filteredReferees.map((r) => (
                      <div
                        key={r.id}
                        className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.refereeId === r.id ? "bg-blue-100 font-semibold" : ""
                          }`}
                        onClick={() => handleRefereeSelect(r)}
                      >
                        {resolveName(r)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* NOTES */}
                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    placeholder="Kit colors, parking info, etc."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className="flex items-center justify-between p-6 bg-slate-50 border-t">
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
                className="bg-[#006747] hover:bg-[#004d35] px-8"
                disabled={loading}
                onClick={handleSubmit}
              >
                {loading ? <Loader2 className="animate-spin" /> : editData ? 'Update Appointment' : 'Create Appointment'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* SOFT CONFLICT MODAL: Same Date, Different Time                    */}
      {/* ────────────────────────────────────────────────────────────────── */}
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
              <strong className="text-slate-900">{pendingRefereeSelection ? resolveName(pendingRefereeSelection) : 'This referee'}</strong> is already appointed to another match on <strong className="text-slate-900">{formData.matchDate}</strong>.
            </p>

            <p className="text-sm font-semibold text-slate-700">Existing Appointment Details:</p>

            {conflictingAppointment && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2 text-sm text-amber-900">
                <div className="font-bold text-slate-800">
                  {conflictingAppointment.matchTitle || `${conflictingAppointment.homeTeam} vs ${conflictingAppointment.awayTeam}`}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Calendar className="h-3.5 w-3.5" /> {conflictingAppointment.matchDate || conflictingAppointment.date}
                  <Clock className="h-3.5 w-3.5 ml-2" /> {conflictingAppointment.matchTime || conflictingAppointment.time}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <MapPin className="h-3.5 w-3.5" /> {conflictingAppointment.venue || 'N/A'}
                </div>
              </div>
            )}

            <p className="text-sm text-slate-600">
              Do you still want to proceed with this appointment?
            </p>
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
                if (pendingRefereeSelection) {
                  applyRefereeSelection(pendingRefereeSelection);
                }
                setShowSoftConflictModal(false);
                setPendingRefereeSelection(null);
                setConflictingAppointment(null);
              }}
            >
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* HARD CONFLICT MODAL: Double-booked (Same Date & Same Time)          */}
      {/* ────────────────────────────────────────────────────────────────── */}
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
              <strong className="text-slate-900">{pendingRefereeSelection ? resolveName(pendingRefereeSelection) : 'This referee'}</strong> cannot be appointed because they are already booked at the exact same time (<strong className="text-slate-900">{formData.matchTime}</strong>).
            </p>

            <p className="text-sm font-semibold text-slate-700">Conflicting Match Details:</p>

            {conflictingAppointment && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2 text-sm text-red-900">
                <div className="font-bold text-slate-800">
                  {conflictingAppointment.matchTitle || `${conflictingAppointment.homeTeam} vs ${conflictingAppointment.awayTeam}`}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Calendar className="h-3.5 w-3.5" /> {conflictingAppointment.matchDate || conflictingAppointment.date}
                  <Clock className="h-3.5 w-3.5 ml-2 text-red-600 font-bold" /> {conflictingAppointment.matchTime || conflictingAppointment.time}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <MapPin className="h-3.5 w-3.5" /> {conflictingAppointment.venue || 'N/A'}
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
              OK, Select Another Referee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreateAppointmentDialog;