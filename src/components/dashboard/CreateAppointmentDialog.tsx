import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { createAppointment, fetchReferees } from '@/services/appointments';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import type { Profile } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

const CreateAppointmentDialog: React.FC<Props> = ({ open, onOpenChange, onCreated }) => {
  const { profile } = useAuth();
  const [referees, setReferees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const [matchTitle, setMatchTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [competition, setCompetition] = useState('');
  const [refereeId, setRefereeId] = useState<string>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      fetchReferees().then(setReferees).catch(() => setReferees([]));
    }
  }, [open]);

  const reset = () => {
    setMatchTitle(''); setVenue(''); setMatchDate(''); setCompetition(''); setRefereeId(''); setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    try {
      await createAppointment(
        {
          coach_id: profile.id,
          referee_id: refereeId || null,
          match_title: matchTitle,
          venue,
          match_date: new Date(matchDate).toISOString(),
          competition: competition || null,
          notes: notes || null,
        },
        { id: profile.id, role: profile.role, full_name: profile.full_name }

      );
      toast({ title: 'Appointment created', description: 'Referee has been notified.' });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Appointment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>Match Title</Label>
            <Input required value={matchTitle} onChange={(e) => setMatchTitle(e.target.value)} placeholder="e.g. EP Kings vs Sharks U21" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Venue</Label>
              <Input required value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Nelson Mandela Bay Stadium" />
            </div>
            <div>
              <Label>Competition</Label>
              <Input value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="Currie Cup" />
            </div>
          </div>
          <div>
            <Label>Match Date & Time</Label>
            <Input type="datetime-local" required value={matchDate} onChange={(e) => setMatchDate(e.target.value)} />
          </div>
          <div>
            <Label>Assign Referee</Label>
            <Select value={refereeId} onValueChange={setRefereeId}>
              <SelectTrigger>
                <SelectValue placeholder={referees.length ? 'Select a referee' : 'No referees registered yet'} />
              </SelectTrigger>
              <SelectContent>
                {referees.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name} — {r.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any special instructions..." />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-[#006747] hover:bg-[#004d35]" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Appointment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAppointmentDialog;
