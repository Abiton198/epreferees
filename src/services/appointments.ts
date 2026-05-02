import { supabase } from '@/lib/firebase';
import type { Appointment, AppointmentStatus, AuditLog, Profile, UserRole } from '@/types';

export const logAudit = async (
  appointmentId: string,
  actorId: string,
  actorRole: UserRole,
  action: string,
  details?: Record<string, any>
) => {
  const { error } = await supabase.from('audit_logs').insert({
    appointment_id: appointmentId,
    actor_id: actorId,
    actor_role: actorRole,
    action,
    details: details ?? null,
  });
  if (error) console.error('Audit log error:', error);
};

export const fetchCoachAppointments = async (coachId: string): Promise<Appointment[]> => {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('coach_id', coachId)
    .order('match_date', { ascending: false });
  if (error) throw error;
  return (data as Appointment[]) || [];
};

export const fetchRefereeAppointments = async (refereeId: string): Promise<Appointment[]> => {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('referee_id', refereeId)
    .order('match_date', { ascending: false });
  if (error) throw error;
  return (data as Appointment[]) || [];
};

export const fetchReferees = async (): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'referee')
    .order('full_name');
  if (error) throw error;
  return (data as Profile[]) || [];
};

export const fetchProfileById = async (id: string): Promise<Profile | null> => {
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  return (data as Profile) || null;
};

// --- Email notifications ---
type EmailType = 'assigned' | 'accepted' | 'rejected';

interface NotifyArgs {
  type: EmailType;
  appointment: Appointment;
  toProfile: Profile | null;
  actorName?: string;
}

const sendEmailNotification = async (args: NotifyArgs): Promise<void> => {
  if (!args.toProfile?.email) return;
  try {
    const portalUrl = typeof window !== 'undefined' ? window.location.origin : 'https://epru.famous.app';
    await supabase.functions.invoke('send-appointment-email', {
      body: {
        type: args.type,
        to_email: args.toProfile.email,
        to_name: args.toProfile.full_name || undefined,
        match_title: args.appointment.match_title,
        venue: args.appointment.venue,
        match_date: args.appointment.match_date,
        competition: args.appointment.competition,
        notes: args.appointment.notes,
        feedback: args.appointment.feedback,
        actor_name: args.actorName,
        portal_url: portalUrl,
      },
    });
  } catch (err) {
    // Never fail the user-facing flow because of email
    console.warn('Email notification failed (non-blocking):', err);
  }
};

export const createAppointment = async (
  payload: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'status' | 'feedback'>,
  actor: { id: string; role: UserRole; full_name?: string | null }
): Promise<Appointment> => {
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...payload, status: 'pending' })
    .select()
    .single();
  if (error) throw error;

  const appointment = data as Appointment;

  await logAudit(appointment.id, actor.id, actor.role, 'CREATE_APPOINTMENT', {
    match_title: payload.match_title,
    referee_id: payload.referee_id,
  });

  // Notify the referee that they've been assigned
  if (appointment.referee_id) {
    const referee = await fetchProfileById(appointment.referee_id);
    sendEmailNotification({
      type: 'assigned',
      appointment,
      toProfile: referee,
      actorName: actor.full_name || undefined,
    });
  }

  return appointment;
};

export const updateAppointmentStatus = async (
  appointmentId: string,
  status: AppointmentStatus,
  actor: { id: string; role: UserRole; full_name?: string | null },
  feedback?: string
): Promise<void> => {
  const update: any = { status, updated_at: new Date().toISOString() };
  if (feedback !== undefined) update.feedback = feedback;

  const { data, error } = await supabase
    .from('appointments')
    .update(update)
    .eq('id', appointmentId)
    .select()
    .single();
  if (error) throw error;

  await logAudit(appointmentId, actor.id, actor.role, `STATUS_${status.toUpperCase()}`, { feedback });

  // Notify the coach when referee accepts or rejects
  if ((status === 'accepted' || status === 'rejected') && data) {
    const appointment = data as Appointment;
    const coach = await fetchProfileById(appointment.coach_id);
    sendEmailNotification({
      type: status,
      appointment,
      toProfile: coach,
      actorName: actor.full_name || undefined,
    });
  }
};

export const submitFeedback = async (
  appointmentId: string,
  feedback: string,
  actor: { id: string; role: UserRole }
): Promise<void> => {
  const { error } = await supabase
    .from('appointments')
    .update({ feedback, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);
  if (error) throw error;
  await logAudit(appointmentId, actor.id, actor.role, 'UPDATE_FEEDBACK', { feedback });
};

export const fetchAuditTrail = async (appointmentId: string): Promise<AuditLog[]> => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as AuditLog[]) || [];
};

export const fetchUserAuditTrail = async (userId: string): Promise<AuditLog[]> => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('actor_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as AuditLog[]) || [];
};
