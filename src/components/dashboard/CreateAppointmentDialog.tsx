import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import {
  Loader2, Search, X, ChevronDown, Clock, MapPin,
  Users, Shield, Calendar, HelpCircle, Info,
  Trophy, Flag, CheckCircle2, ChevronLeft, ChevronRight
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

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
  editData?: any; // Pass this for EDIT mode
}

const resolveName = (obj: any): string =>
  obj?.full_name || obj?.fullName || obj?.displayName || obj?.name || obj?.email || 'Unknown';

// ─── Component ──────────────────────────────────────────────────────────────

const CreateAppointmentDialog: React.FC<Props> = ({ open, onOpenChange, onCreated, editData }) => {
  const { user, profile } = useAuth() as any;

  // Data States
  const [teams, setTeams] = useState<Team[]>([]);
  const [referees, setReferees] = useState<RefereeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [step, setStep] = useState(1);

  // Form States (Combined for easy reset/edit)
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
        // 1. Fetch from all possible sources
        const [teamsSnap, refSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'teams')),
          getDocs(collection(db, 'referees')),
          getDocs(query(collection(db, 'users'), where('role', '==', 'referee'))),
        ]);

        setTeams(teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));

        // 2. Map old referees collection
        const refs = refSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            // Support both naming conventions
            displayName: data.full_name || data.displayName || data.name || 'Unnamed Ref'
          };
        });

        // 3. Map new users collection (already filtered by role in the query)
        const refUsers = usersSnap.docs.map(d => {
          const data = d.data();
          return {
            // Check the doc ID, then the uid field, then fallback to a random string
            id: d.id || data.uid || data.id,
            ...data,
            displayName: data.full_name || data.displayName || 'Unnamed Ref'
          };
        });

        // 4. Merge and de-duplicate by ID
        // We use a Map where the Key is the ID to ensure each referee appears only once
        const combinedMap = new Map();
        [...refs, ...refUsers].forEach(r => combinedMap.set(r.id, r));

        const uniqueRefs = Array.from(combinedMap.values());
        setReferees(uniqueRefs);

        // 5. Handle Edit Mode pre-fill with camelCase support
        if (editData) {
          setFormData({
            competitionType: editData.competitionType || '',
            competitionName: editData.competition || '',
            teamAId: editData.homeTeamId || '',
            teamAManual: !editData.homeTeamId ? editData.homeTeam : '',
            teamBId: editData.awayTeamId || '',
            teamBManual: !editData.awayTeamId ? editData.awayTeam : '',
            teamLevel: editData.teamLevel || 'main',
            // Prioritize camelCase (matchDate) but fallback to snake_case (date)
            matchDate: editData.matchDate || editData.date || '',
            matchTime: editData.matchTime || editData.time || '',
            venue: editData.venue || '',
            refereeId: editData.refereeId || '',
            refereeRole: editData.refereeRole || 'referee',
            officialRole: editData.officialRole || "Referee",
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

      const homeName = isClub ? selectedTeamA?.name : formData.teamAManual;
      const awayName = isClub ? selectedTeamB?.name : formData.teamBManual;

      const payload = {
        ...formData,
        competition: formData.competitionName || formData.competitionType,
        homeTeam: homeName,
        awayTeam: awayName,
        matchTitle: `${homeName} vs ${awayName}`,
        refereeName: assignedRef ? resolveName(assignedRef) : null,
        refereeEmail: assignedRef?.email || null,
        coachId: profile?.id || user?.uid,
        coachName: profile?.firstName || profile?.displayName || 'Coach',
        status: editData ? editData.status : 'pending',
        updatedAt: serverTimestamp(),
      };

      if (editData?.id) {
        await updateDoc(doc(db, 'appointments', editData.id), payload);
        toast({ title: "Success", description: "Appointment updated successfully" });
      } else {
        await addDoc(collection(db, 'appointments'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        toast({ title: "Success", description: "Appointment created successfully" });
      }

      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Team Search Logic
  const filteredTeamA = teams.filter((t) =>
    t.name.toLowerCase().includes(teamASearch.toLowerCase())
  );

  const filteredTeamB = teams.filter((t) =>
    t.name.toLowerCase().includes(teamBSearch.toLowerCase())
  );



  const filteredReferees = referees.filter((r) =>
    resolveName(r).toLowerCase().includes(refereeSearch.toLowerCase())
  );

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
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
                              className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamAId === t.id
                                ? "bg-blue-100 font-semibold"
                                : ""
                                }`}
                              onClick={() => {
                                updateField("teamAId", t.id);
                                setTeamASearch(t.name);

                                if (t?.homeGround) {
                                  updateField("venue", t.homeGround);
                                }
                              }}
                            >
                              {t.name}
                            </div>
                          ))
                        ) : (
                          <div className="p-2 text-gray-500 text-sm">
                            No teams found
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <Input
                      value={formData.teamAManual}
                      onChange={(e) =>
                        updateField("teamAManual", e.target.value)
                      }
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
                              className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.teamBId === t.id
                                ? "bg-blue-100 font-semibold"
                                : ""
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
                          <div className="p-2 text-gray-500 text-sm">
                            No teams found
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <Input
                      value={formData.teamBManual}
                      onChange={(e) =>
                        updateField("teamBManual", e.target.value)
                      }
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
                  <Input type="date" value={formData.matchDate} onChange={(e) => updateField('matchDate', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input type="time" value={formData.matchTime} onChange={(e) => updateField('matchTime', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Venue / Ground</Label>
                <Input value={formData.venue} onChange={(e) => updateField('venue', e.target.value)} placeholder="Where is the match?" />
              </div>
            </div>
          )}

          {/* STEP 4: Assignment */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">

              {/* ROLE */}
              <div className="space-y-2">
                <Label>Official Role</Label>

                <select
                  className="w-full p-2 border rounded-md"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  {officialRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
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
                    className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.refereeId === ""
                      ? "bg-blue-100 font-semibold"
                      : ""
                      }`}
                    onClick={() => {
                      updateField("refereeId", "");
                      setRefereeSearch("");
                    }}
                  >
                    Leave Unassigned
                  </div>

                  {filteredReferees.map((r) => (
                    <div
                      key={r.id}
                      className={`p-2 cursor-pointer hover:bg-gray-100 ${formData.refereeId === r.id
                        ? "bg-blue-100 font-semibold"
                        : ""
                        }`}
                      onClick={() => {
                        updateField("refereeId", r.id);
                        updateField("officialRole", selectedRole);
                        setRefereeSearch(resolveName(r));
                      }}
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
          )}        </div>
        {/* Footer Navigation */}
        <div className="flex items-center justify-between p-6 bg-slate-50 border-t">
          <Button
            variant="outline"
            onClick={() => step === 1 ? onOpenChange(false) : setStep(step - 1)}
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
              {loading ? <Loader2 className="animate-spin" /> : (editData ? 'Update Appointment' : 'Create Appointment')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAppointmentDialog;