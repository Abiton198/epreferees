export type UserRole = 'coach' | 'referee';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export type AppointmentStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

export interface Appointment {
  id: string;
  coach_id: string;
  referee_id: string | null;
  match_title: string;
  venue: string;
  match_date: string;
  competition: string | null;
  notes: string | null;
  status: AppointmentStatus;
  feedback: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  actor?: Profile;
}
