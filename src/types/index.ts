export type UserRole = 'coach' | 'referee';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: string;
  approved: boolean;
  createdAt: string;
  lastLogin: string;
}

export type AppointmentStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

export interface Appointment {
  id: string;
  coachId: string;
  refereeId: string | null;
  refereeName?: string;
  coachName?: string;
  homeTeam?: string;
  awayTeam?: string;
  matchDate: string;
  matchTime: string;
  matchTitle: string;
  venue: string;
  competition: string | null;
  notes: string | null;
  status: AppointmentStatus;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
  coach?: Profile;
  referee?: Profile;
}

export interface AuditLog {
  id: string;
  appointment_id: string;
  actor_id: string;
  actor_role: UserRole;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
  actor?: Profile;
}
