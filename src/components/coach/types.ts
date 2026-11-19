export interface CoachAppointment {
    id: string;
    coachId: string;
    coachName: string;
    refereeId: string;
    refereeName: string;
    refereeEmail: string;
    match: string;
    matchDate: string;
    kickoffTime?: string;
    venue: string;
    level: string;
    matchId: string;
    status: 'pending' | 'accepted' | 'completed';
    appointedBy?: string;
    createdAt?: any;
}

export interface AuditEntry {
    action:
    | 'APPOINTMENT_VIEWED'
    | 'APPOINTMENT_ACCEPTED'
    | 'PERFORMANCE_REPORT_SUBMITTED'
    | 'INCIDENT_REPORT_SUBMITTED';
    actorId: string;
    actorName: string;
    actorRole: 'coach';
    matchId: string;
    matchTitle: string;
    refereeId: string;
    refereeName: string;
    rating?: number;
    metadata?: Record<string, any>;
    timestamp?: any;
}