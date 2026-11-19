/**
 * functions/src/index.ts — EPRU Referee Portal email notifications v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Email strategy:
 *   - REFEREES  → immediate individual email on new appointment / assignment
 *   - COACHES   → immediate individual email when appointed as Referee Assessment Coach
 *               → batched summary every 20 referee responses (or daily at 08:00)
 *               → immediate urgent alert when a referee declines
 */

import { onDocumentCreated, onDocumentUpdated }
  from 'firebase-functions/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

admin.initializeApp();
const db = admin.firestore();
const RESEND_KEY = defineSecret('RESEND_API_KEY');
const FROM_ADDRESS = 'EPRU Referee Portal <noreply@epreferees.co.za>';
const PORTAL_URL = 'https://www.epreferees.co.za';
const SUMMARY_THRESHOLD = 20;


// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function getUserEmail(uid?: string | null): Promise<string | null> {
  if (!uid) return null;
  try {
    const snap = await db.collection('users').doc(uid).get();
    return snap.exists ? (snap.data()?.email ?? null) : null;
  } catch { return null; }
}

async function getUserName(uid?: string | null, fallback = 'Official'): Promise<string> {
  if (!uid) return fallback;
  try {
    const snap = await db.collection('users').doc(uid).get();
    const d = snap.data();
    if (!d) return fallback;
    return (
      d.full_name ||
      d.fullName ||
      d.displayName ||
      `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() ||
      fallback
    );
  } catch { return fallback; }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'TBD';
  try {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return dateStr; }
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return 'TBD';
  try {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(+h, +m);
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch { return timeStr; }
}

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d;
}

async function sendOrQueue(
  resend: Resend,
  payload: { from: string; to: string | string[]; subject: string; html: string },
): Promise<void> {
  try {
    await resend.emails.send(payload);
  } catch (err: any) {
    if (err?.statusCode === 429 || err?.name === 'rate_limit_exceeded') {
      await db.collection('emailQueue').add({
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        retryAfter: tomorrow(),
      });
      console.log('[Queue] Rate limit — queued for tomorrow:', payload.to);
    } else {
      throw err;
    }
  }
}

async function sendCoachAssessmentInvitation(
  resend: Resend,
  params: {
    coachId?: string | null;
    coachEmail?: string | null;
    coachName?: string | null;
    refereeId?: string | null;
    refereeName?: string | null;
    matchTitle: string;
    dateStr?: string | null;
    timeStr?: string | null;
    venue?: string | null;
    level?: string | null;
    appointedBy?: string | null;
  },
): Promise<void> {
  const coachEmail = params.coachEmail || await getUserEmail(params.coachId);
  if (!coachEmail) {
    console.warn('[Coach Invite] No coach email found for:', params.coachId || params.coachName);
    return;
  }

  const coachName = params.coachName || await getUserName(params.coachId, 'Coach');
  const refereeName = params.refereeName || await getUserName(params.refereeId, 'TBD');

  await sendOrQueue(resend, {
    from: FROM_ADDRESS,
    to: coachEmail,
    subject: `🎯 Referee Assessment Coach Appointment — ${params.matchTitle}`,
    html: coachAppointmentEmailHtml({
      coachName,
      refereeName,
      matchTitle: params.matchTitle,
      date: formatDate(params.dateStr),
      time: formatTime(params.timeStr),
      venue: params.venue || 'TBD',
      level: params.level || 'Club',
      appointedBy: params.appointedBy || 'EPRU Executive',
      portalUrl: PORTAL_URL,
    }),
  });

  console.log('[Email -> Appointed Coach]', coachEmail, 'for', params.matchTitle);
}

// ══════════════════════════════════════════════════════════════════════════
// RESOLVE APPOINTING EXECUTIVE FOR A COACH REPORT
// ══════════════════════════════════════════════════════════════════════════

async function resolveAppointingExecutive(
  report: Record<string, any>,
): Promise<{ email: string | null; name: string }> {
  // 1. Direct email on report if present
  if (report.appointedByEmail && typeof report.appointedByEmail === 'string') {
    return {
      email: report.appointedByEmail.trim(),
      name: report.appointedByName || 'Executive',
    };
  }

  const candidateUids: string[] = [];
  const pushUid = (val: unknown) => {
    if (typeof val === 'string' && val.trim() && !candidateUids.includes(val.trim())) {
      candidateUids.push(val.trim());
    }
  };

  pushUid(report.appointedByUid);
  pushUid(report.appointedById);
  pushUid(report.executiveUid);
  pushUid(report.excoUid);

  const matchId = report.matchDetails?.matchId || report.matchId || null;
  const coachApptId = report.appointmentId || null;

  // 2. Check linked `coachAppointments` doc if present
  if (coachApptId) {
    try {
      const caSnap = await db.collection('coachAppointments').doc(coachApptId).get();
      if (caSnap.exists) {
        const ca = caSnap.data()!;
        if (ca.appointedByEmail && typeof ca.appointedByEmail === 'string') {
          return {
            email: ca.appointedByEmail.trim(),
            name: ca.appointedByName || ca.appointedBy || 'Executive',
          };
        }
        pushUid(ca.appointedByUid);
        pushUid(ca.appointedById);
        pushUid(ca.createdByUid);
        pushUid(ca.createdBy);
      }
    } catch (err) {
      console.warn('[Exco Lookup] Failed reading coachAppointments:', err);
    }
  }

  // 3. Check parent `appointments` fixture doc & its auditTrail
  if (matchId) {
    try {
      const apptSnap = await db.collection('appointments').doc(matchId).get();
      if (apptSnap.exists) {
        const appt = apptSnap.data()!;
        if (appt.appointedByEmail && typeof appt.appointedByEmail === 'string') {
          return {
            email: appt.appointedByEmail.trim(),
            name: appt.appointedByName || appt.appointedBy || 'Executive',
          };
        }

        pushUid(appt.coachAppointedByUid);
        pushUid(appt.appointedByUid);
        pushUid(appt.appointedById);
        pushUid(appt.createdByUid);
        pushUid(appt.createdBy);
        pushUid(appt.userId);

        // Look through auditTrail (most recent first) for coach assignment or fixture creation
        if (Array.isArray(appt.auditTrail)) {
          for (let i = appt.auditTrail.length - 1; i >= 0; i--) {
            const entry = appt.auditTrail[i];
            if (!entry) continue;
            const action = String(entry.action || '').toLowerCase();
            if (
              action.includes('coach') ||
              action.includes('appoint') ||
              action.includes('created') ||
              entry.byRole === 'executive'
            ) {
              pushUid(entry.by);
              pushUid(entry.byUid);
              pushUid(entry.actorId);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Exco Lookup] Failed reading appointments:', err);
    }
  }

  // 4. Resolve email from `users` for the first matching UID
  for (const uid of candidateUids) {
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      if (userSnap.exists) {
        const u = userSnap.data()!;
        if (u.email) {
          const execName =
            u.full_name ||
            u.fullName ||
            u.displayName ||
            `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
            'Executive';
          return { email: String(u.email).trim(), name: execName };
        }
      }
    } catch (err) {
      console.warn('[Exco Lookup] Failed reading user doc:', uid, err);
    }
  }

  return { email: null, name: 'Executive' };
}

// ══════════════════════════════════════════════════════════════════════════
// COACH NOTIFICATION QUEUE (Referee accept/decline summaries)
// ══════════════════════════════════════════════════════════════════════════

interface QueuedNotification {
  coachId: string;
  coachEmail: string;
  coachName: string;
  type: 'accepted' | 'rejected';
  refereeName: string;
  matchInfo: string;
  date: string;
  time: string;
  venue: string;
  reason: string | null;
  sent: boolean;
}

async function claimFlushIfThresholdReached(
  coachId: string,
  coachEmail: string,
  coachName: string,
): Promise<{ shouldSend: boolean; count: number }> {
  const counterRef = db.collection('coachSummaryCounters').doc(coachId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists ? snap.data()! : {};
    const current = data.pendingCount ?? 0;
    const locked = data.flushInProgress ?? false;
    const next = current + 1;

    const shouldSend = next >= SUMMARY_THRESHOLD && !locked;

    tx.set(counterRef, {
      pendingCount: next,
      flushInProgress: locked || shouldSend,
      coachEmail,
      coachName,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { shouldSend, count: next };
  });
}

async function tryClaimFlushLock(coachId: string): Promise<boolean> {
  const counterRef = db.collection('coachSummaryCounters').doc(coachId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists ? snap.data()! : {};
    if (data.flushInProgress) return false;
    tx.set(counterRef, { flushInProgress: true }, { merge: true });
    return true;
  });
}

async function releaseFlushLock(coachId: string, resetCount: boolean): Promise<void> {
  const counterRef = db.collection('coachSummaryCounters').doc(coachId);
  const update: Record<string, unknown> = { flushInProgress: false };
  if (resetCount) {
    update.pendingCount = 0;
    update.lastSentAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await counterRef.set(update, { merge: true });
}

async function queueCoachNotification(
  coachId: string,
  coachEmail: string,
  coachName: string,
  notification: Omit<QueuedNotification, 'coachId' | 'coachEmail' | 'coachName' | 'sent'>,
): Promise<{ shouldSend: boolean; count: number }> {
  await db.collection('coachNotificationQueue').add({
    coachId, coachEmail, coachName,
    ...notification,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sent: false,
  });

  const { shouldSend, count } = await claimFlushIfThresholdReached(coachId, coachEmail, coachName);
  console.log(`[Queue] Coach ${coachId}: ${count}/${SUMMARY_THRESHOLD}${shouldSend ? ' (flush claimed)' : ''}`);
  return { shouldSend, count };
}

async function flushCoachSummary(
  resend: Resend,
  coachId: string,
  coachEmail: string,
  coachName: string,
): Promise<void> {
  try {
    const snap = await db.collection('coachNotificationQueue')
      .where('coachId', '==', coachId)
      .where('sent', '==', false)
      .orderBy('createdAt', 'asc')
      .get();

    if (snap.empty) {
      await releaseFlushLock(coachId, true);
      return;
    }

    const notifications = snap.docs.map(d => ({
      id: d.id, ...(d.data() as QueuedNotification),
    }));

    const additionalEmails = [
      'ctobias@mandelametro.gov.za',
      'eprrschairperson@gmail.com',
      'rodneybonaparte04@gmail.com',
    ];
    const normalizedCoach = coachEmail?.trim().toLowerCase();

    const extraRecipients = additionalEmails.filter(
      email => email.trim().toLowerCase() !== normalizedCoach
    );

    const RECIPIENTS = [coachEmail, ...extraRecipients].filter(Boolean);

    await sendOrQueue(resend, {
      from: FROM_ADDRESS,
      to: RECIPIENTS.join(', '),
      subject: `📊 Appointment Summary — ${notifications.length} updates`,
      html: summaryEmailHtml({ coachName, notifications }),
    });

    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { sent: true }));
    await batch.commit();

    await releaseFlushLock(coachId, true);
    console.log(`[Summary] Sent ${notifications.length} items to ${RECIPIENTS.join(', ')}`);
  } catch (err) {
    await releaseFlushLock(coachId, false);
    console.error(`[Summary] Flush failed for ${coachId}:`, err);
    throw err;
  }
}


// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 1 — Appointment created → email referee & appointed coach immediately
// ══════════════════════════════════════════════════════════════════════════

export const onAppointmentCreated = onDocumentCreated(
  { document: 'appointments/{apptId}', secrets: [RESEND_KEY] },
  async (event) => {
    const appt = event.data?.data();
    if (!appt) return;

    const createdAt = event.data?.createTime?.toDate();
    if (Date.now() - (createdAt?.getTime() ?? 0) > 5 * 60 * 1000) {
      console.log('[Skip] Old document:', event.params.apptId);
      return;
    }

    const resend = new Resend(RESEND_KEY.value());
    const matchTitle = `${appt.homeTeam || 'TBD'} vs ${appt.awayTeam || 'TBD'}`;

    // 1. Referee notification
    const refereeEmail = appt.refereeEmail ?? await getUserEmail(appt.refereeId);
    const refereeName = appt.refereeName ?? await getUserName(appt.refereeId, 'Referee');

    if (refereeEmail) {
      await sendOrQueue(resend, {
        from: FROM_ADDRESS,
        to: refereeEmail,
        subject: `📋 New Match Appointment — ${matchTitle}`,
        html: appointmentEmailHtml({
          refereeName,
          coachName: appt.coachName || 'Your coach',
          homeTeam: appt.homeTeam || 'TBD',
          awayTeam: appt.awayTeam || 'TBD',
          venue: appt.venue || 'TBD',
          date: formatDate(appt.date || appt.matchDate || ''),
          time: formatTime(appt.time || appt.matchTime || ''),
          role: (appt.role || appt.officialRole || 'Referee')
            .replace(/^\w/, (c: string) => c.toUpperCase()),
          portalUrl: PORTAL_URL,
        }),
      });
      console.log('[Email -> Referee]', refereeEmail);
    } else {
      console.warn('[Created] No referee email:', event.params.apptId);
    }

    // 2. Coach assessment appointment notification (if a coach was assigned at creation)
    if (appt.coachId || appt.coachEmail) {
      await sendCoachAssessmentInvitation(resend, {
        coachId: appt.coachId,
        coachEmail: appt.coachEmail,
        coachName: appt.coachName,
        refereeId: appt.refereeId,
        refereeName,
        matchTitle,
        dateStr: appt.date || appt.matchDate || '',
        timeStr: appt.time || appt.matchTime || '',
        venue: appt.venue || 'TBD',
        level: appt.competition || appt.competitionName || appt.teamLevel || 'Club',
        appointedBy: appt.createdByName || appt.appointedBy || 'EPRU Executive',
      });
    }
  }
);


// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 2 — Appointment updated → new referee, new/changed coach, or response
// ══════════════════════════════════════════════════════════════════════════

export const onAppointmentUpdated = onDocumentUpdated(
  { document: 'appointments/{apptId}', secrets: [RESEND_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const resend = new Resend(RESEND_KEY.value());
    const matchTitle = `${after.homeTeam || 'TBD'} vs ${after.awayTeam || 'TBD'}`;

    // 1. Newly assigned or swapped Referee
    const isNewlyAssignedRef =
      (!before.refereeId && after.refereeId) ||
      (before.status === 'pending_assignment' && after.status === 'pending') ||
      (before.refereeId && after.refereeId && before.refereeId !== after.refereeId);

    if (isNewlyAssignedRef && after.refereeId) {
      const refereeEmail = after.refereeEmail ?? await getUserEmail(after.refereeId);
      const refereeName = after.refereeName ?? await getUserName(after.refereeId, 'Referee');

      if (refereeEmail) {
        await sendOrQueue(resend, {
          from: FROM_ADDRESS,
          to: refereeEmail,
          subject: `📋 New Match Appointment — ${matchTitle}`,
          html: appointmentEmailHtml({
            refereeName,
            coachName: after.coachName || 'Your coach',
            homeTeam: after.homeTeam || 'TBD',
            awayTeam: after.awayTeam || 'TBD',
            venue: after.venue || 'TBD',
            date: formatDate(after.date || after.matchDate || ''),
            time: formatTime(after.time || after.matchTime || ''),
            role: (after.role || after.officialRole || 'Referee')
              .replace(/^\w/, (c: string) => c.toUpperCase()),
            portalUrl: PORTAL_URL,
          }),
        });
        console.log('[Email -> Newly Assigned Referee]', refereeEmail);
      }
    }

    // 2. Newly assigned or swapped Referee Assessment Coach
    const isNewlyAssignedCoach =
      Boolean(after.coachId || after.coachEmail) &&
      (before.coachId !== after.coachId || before.coachEmail !== after.coachEmail);

    if (isNewlyAssignedCoach) {
      await sendCoachAssessmentInvitation(resend, {
        coachId: after.coachId,
        coachEmail: after.coachEmail,
        coachName: after.coachName,
        refereeId: after.refereeId,
        refereeName: after.refereeName,
        matchTitle,
        dateStr: after.date || after.matchDate || '',
        timeStr: after.time || after.matchTime || '',
        venue: after.venue || 'TBD',
        level: after.competition || after.competitionName || after.teamLevel || 'Club',
        appointedBy: after.updatedByName || after.appointedBy || 'EPRU Executive',
      });
    }

    // 3. Referee status response (accepted / rejected)
    if (before.status === after.status) return;

    const isAccepted = after.status === 'accepted' && before.status !== 'accepted';
    const isRejected = after.status === 'rejected' && before.status !== 'rejected';
    if (!isAccepted && !isRejected) return;

    const coachId = after.coachId;
    const coachEmail = after.coachEmail ?? await getUserEmail(coachId);
    const coachName = after.coachName || 'Coach';
    const refereeName = after.refereeName ?? await getUserName(after.refereeId, 'Referee');

    if (!coachEmail || !coachId) {
      console.warn('[Updated] No coach info:', event.params.apptId);
      return;
    }

    const date = formatDate(after.date || after.matchDate || '');
    const time = formatTime(after.time || after.matchTime || '');
    const venue = after.venue || 'TBD';

    if (isRejected) {
      const reason = after.rejectionReason || after.declineReason || 'No reason provided';

      const additionalEmails = ['ctobias@mandelametro.gov.za', 'eprrschairperson@gmail.com'];
      const normalizedCoach = coachEmail.trim().toLowerCase();
      const extraRecipients = additionalEmails.filter(
        email => email.trim().toLowerCase() !== normalizedCoach
      );
      const RECIPIENTS = [coachEmail, ...extraRecipients].filter(Boolean);

      await sendOrQueue(resend, {
        from: FROM_ADDRESS,
        to: RECIPIENTS,
        subject: `🚨 URGENT: Referee Declined — ${matchTitle}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #dc2626; margin-top: 0;">🚨 Referee Appointment Declined</h2>
            <p>Hi <strong>${coachName}</strong>,</p>
            <p><strong>${refereeName}</strong> has declined the appointment for your upcoming fixture. Please review the details below and reassign another referee immediately.</p>

            <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 4px 0;"><strong>Match:</strong> ${matchTitle}</p>
              <p style="margin: 4px 0;"><strong>Date:</strong> ${date} at ${time}</p>
              <p style="margin: 4px 0;"><strong>Venue:</strong> ${venue}</p>
              <p style="margin: 4px 0; color: #991b1b;"><strong>Reason Given:</strong> ${reason}</p>
            </div>

            <p>Log in to the portal now to select a replacement referee.</p>
          </div>
        `,
      });

      await db.collection('coachNotificationQueue').add({
        coachId,
        type: 'rejected',
        refereeName,
        matchInfo: matchTitle,
        date,
        time,
        venue,
        reason,
        sent: true,
        createdAt: new Date(),
      });

      console.log(`[Urgent] Rejection notification sent immediately to ${RECIPIENTS.join(', ')}`);
      return;
    }

    if (isAccepted) {
      const { shouldSend } = await queueCoachNotification(
        coachId, coachEmail, coachName,
        {
          type: 'accepted',
          refereeName,
          matchInfo: matchTitle,
          date,
          time,
          venue,
          reason: null,
        },
      );

      if (shouldSend) {
        await flushCoachSummary(resend, coachId, coachEmail, coachName);
      }
    }
  }
);


// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 3 — Coach appointment doc created/updated in `coachAppointments`
// ══════════════════════════════════════════════════════════════════════════

export const onCoachAppointmentCreated = onDocumentCreated(
  { document: 'coachAppointments/{coachApptId}', secrets: [RESEND_KEY] },
  async (event) => {
    const coachAppt = event.data?.data();
    if (!coachAppt) return;

    const createdAt = event.data?.createTime?.toDate();
    if (Date.now() - (createdAt?.getTime() ?? 0) > 5 * 60 * 1000) return;

    // If linked to a parent match doc, `onAppointmentCreated`/`onAppointmentUpdated`
    // already handles emailing when `appointments` is created/edited; only send here
    // if created standalone or explicitly flagged with `sendInviteEmail: true`.
    if (coachAppt.matchId && !coachAppt.sendInviteEmail) return;

    const resend = new Resend(RESEND_KEY.value());
    await sendCoachAssessmentInvitation(resend, {
      coachId: coachAppt.coachId,
      coachEmail: coachAppt.coachEmail,
      coachName: coachAppt.coachName,
      refereeId: coachAppt.refereeId,
      refereeName: coachAppt.refereeName,
      matchTitle: coachAppt.match || 'Upcoming Fixture',
      dateStr: coachAppt.matchDate || coachAppt.date || '',
      timeStr: coachAppt.kickoffTime || coachAppt.time || '',
      venue: coachAppt.venue || 'TBD',
      level: coachAppt.level || 'Club',
      appointedBy: coachAppt.appointedBy || 'EPRU Executive',
    });
  }
);

// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 4 — Coach submits report → email ONLY appointing Executive
// ══════════════════════════════════════════════════════════════════════════

export const onCoachReportCreated = onDocumentCreated(
  { document: 'coachReports/{reportId}', secrets: [RESEND_KEY] },
  async (event) => {
    const report = event.data?.data();
    if (!report) return;

    const createdAt = event.data?.createTime?.toDate();
    if (Date.now() - (createdAt?.getTime() ?? 0) > 5 * 60 * 1000) {
      console.log('[Skip] Old coachReport document:', event.params.reportId);
      return;
    }

    const { email: execEmail, name: execName } = await resolveAppointingExecutive(report);
    if (!execEmail) {
      console.warn('[CoachReport] Could not resolve appointing executive email for:', event.params.reportId);
      return;
    }

    const matchDetails = report.matchDetails || {};
    const coach = report.coach || {};
    const referee = report.referee || {};
    const gameStats = report.gameStats || {};
    const coachingNotes = report.coachingNotes || {};

    const matchTitle =
      matchDetails.match ||
      report.match ||
      `${matchDetails.homeTeam || 'TBD'} vs ${matchDetails.awayTeam || 'TBD'}`;

    const coachName = coach.name || report.coachName || 'Referee Assessment Coach';
    const refereeName = referee.name || report.refereeName || 'Referee';
    const rating = report.rating ?? report.overallRating;
    const totalPenalties = gameStats.totalPenalties ?? gameStats.penalties;
    const reportTypeLabel =
      report.reportType === 'incident'
        ? 'Match Incident Report'
        : 'Referee Performance Report';

    const resend = new Resend(RESEND_KEY.value());
    await sendOrQueue(resend, {
      from: FROM_ADDRESS,
      to: execEmail,
      subject: `📝 Coach Report Submitted: ${matchTitle} (${refereeName})`,
      html: coachReportSubmittedEmailHtml({
        executiveName: execName,
        reportType: reportTypeLabel,
        coachName,
        refereeName,
        matchTitle,
        date: formatDate(matchDetails.matchDate || report.matchDate || ''),
        venue: matchDetails.venue || report.venue || 'TBD',
        level: matchDetails.level || report.level || 'Club',
        rating: rating ? `${rating} / 5 ★` : 'N/A',
        totalPenalties: totalPenalties !== undefined ? String(totalPenalties) : 'N/A',
        strengths: coachingNotes.strengths || report.comments || '',
        portalUrl: PORTAL_URL,
      }),
    });

    console.log(`[Email -> Appointing Executive Only] ${execEmail} for report ${event.params.reportId}`);
  }
);


// ══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE — COACH REPORT SUBMITTED (TO APPOINTING EXECUTIVE)
// ══════════════════════════════════════════════════════════════════════════

function coachReportSubmittedEmailHtml(p: {
  executiveName: string;
  reportType: string;
  coachName: string;
  refereeName: string;
  matchTitle: string;
  date: string;
  venue: string;
  level: string;
  rating: string;
  totalPenalties: string;
  strengths: string;
  portalUrl: string;
}): string {
  const fields: Record<string, string> = {
    'Report Type': p.reportType,
    'Match': p.matchTitle,
    'Assessed Referee': p.refereeName,
    'Assessment Coach': p.coachName,
    'Date': p.date,
    'Venue': p.venue,
    'Level': p.level,
    'Star Rating': p.rating,
  };

  if (p.totalPenalties !== 'N/A') {
    fields['Total Penalties'] = p.totalPenalties;
  }

  const notesBlock = p.strengths
    ? `<p style="margin:14px 0 0;font-size:13px;color:#374151;
               background:#f8fafc;border:1px solid #e2e8f0;
               border-radius:8px;padding:12px 14px;line-height:1.5;">
         <strong style="color:#111827;">Key Notes / Summary:</strong> ${p.strengths}
       </p>`
    : '';

  return baseHtml(`
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#059669;
               text-transform:uppercase;letter-spacing:1px;">Assessment Report Submitted</p>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#1f2937;">
      New report ready for review, ${p.executiveName.split(' ')[0]}
    </h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      <strong>${p.coachName}</strong> has submitted a <strong>${p.reportType}</strong> for
      <strong>${p.refereeName}</strong>. Because you appointed this assessment coach, please
      log in to the EPRU Referee Portal to inspect the full report.
    </p>
    ${matchCard(fields)}
    ${notesBlock}
    ${ctaButton('Check Report in Portal', p.portalUrl)}
  `);
}

// ══════════════════════════════════════════════════════════════════════════
// SCHEDULED — Daily 08:00: flush any coach with pending notifications
// ══════════════════════════════════════════════════════════════════════════

export const dailyCoachSummary = onSchedule(
  { schedule: 'every day 08:00', secrets: [RESEND_KEY] },
  async () => {
    const resend = new Resend(RESEND_KEY.value());
    const countersSnap = await db.collection('coachSummaryCounters')
      .where('pendingCount', '>', 0)
      .get();

    if (countersSnap.empty) {
      console.log('[Daily] No pending coach summaries');
      return;
    }

    console.log(`[Daily] Checking ${countersSnap.size} coaches`);
    for (const doc of countersSnap.docs) {
      const { coachEmail, coachName } = doc.data();

      const claimed = await tryClaimFlushLock(doc.id);
      if (!claimed) {
        console.log(`[Daily] Skipping ${doc.id} — flush already in progress`);
        continue;
      }

      await flushCoachSummary(resend, doc.id, coachEmail, coachName);
    }
  }
);


// ══════════════════════════════════════════════════════════════════════════
// SCHEDULED — Daily 06:00: retry failed emails
// ══════════════════════════════════════════════════════════════════════════

export const drainEmailQueue = onSchedule(
  { schedule: 'every day 06:00', secrets: [RESEND_KEY] },
  async () => {
    const resend = new Resend(RESEND_KEY.value());
    const snap = await db.collection('emailQueue')
      .where('retryAfter', '<=', new Date())
      .limit(90)
      .get();

    if (snap.empty) { console.log('[Queue] Nothing to retry'); return; }

    for (const docSnap of snap.docs) {
      const q = docSnap.data();
      try {
        await resend.emails.send({ from: FROM_ADDRESS, to: q.to, subject: q.subject, html: q.html });
        await docSnap.ref.delete();
        console.log('[Queue] Retry sent:', q.to);
      } catch (err) {
        console.error('[Queue] Retry failed:', q.to, err);
      }
    }
  }
);


// ══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════════════════

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:580px;background:#fff;border-radius:16px;
                    overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#0d9488);
                     padding:24px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;font-weight:700;color:rgba(255,255,255,0.8);
                      text-transform:uppercase;letter-spacing:2px;">
              Eastern Province Rugby Union
            </p>
            <h1 style="margin:6px 0 0;font-size:20px;font-weight:900;color:#fff;">
              Referee Portal
            </h1>
          </td>
        </tr>
        <tr><td style="padding:28px 32px;">${content}</td></tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;
                     border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              Automated notification — EPRU Referee Portal. Do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function matchCard(fields: Record<string, string>): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0"
       style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin:16px 0;">
  ${Object.entries(fields).map(([label, value], i, arr) => `
  <tr>
    <td style="padding:9px 14px;font-size:11px;font-weight:700;color:#6b7280;
               text-transform:uppercase;letter-spacing:1px;white-space:nowrap;width:1%;">
      ${label}
    </td>
    <td style="padding:9px 14px;font-size:13px;font-weight:600;color:#1f2937;">
      ${value}
    </td>
  </tr>
  ${i < arr.length - 1 ? '<tr><td colspan="2" style="padding:0 14px;"><hr style="border:0;border-top:1px solid #d1fae5;margin:0;"/></td></tr>' : ''}
  `).join('')}
</table>`;
}

function ctaButton(text: string, url: string, color = '#059669'): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
  <tr><td align="center">
    <a href="${url}"
       style="display:inline-block;padding:13px 28px;background:${color};color:#fff;
              font-size:14px;font-weight:900;text-decoration:none;border-radius:10px;">
      ${text} &rarr;
    </a>
  </td></tr>
</table>`;
}

function appointmentEmailHtml(p: {
  refereeName: string; coachName: string; homeTeam: string; awayTeam: string;
  venue: string; date: string; time: string; role: string; portalUrl: string;
}): string {
  return baseHtml(`
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#059669;
               text-transform:uppercase;letter-spacing:1px;">New Appointment</p>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#1f2937;">
      You have been appointed, ${p.refereeName.split(' ')[0]}
    </h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      ${p.coachName} has appointed you to referee the following match.
      Please log in to accept or decline.
    </p>
    ${matchCard({
    'Match': `${p.homeTeam} vs ${p.awayTeam}`,
    'Date': p.date,
    'Time': p.time,
    'Venue': p.venue,
    'Your role': p.role,
  })}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;
               background:#fefce8;border:1px solid #fde68a;
               border-radius:8px;padding:10px 14px;">
      &#9888;&#65039; Please respond promptly. Pending appointments may be reassigned.
    </p>
    ${ctaButton('View & Respond', p.portalUrl)}
  `);
}

function coachAppointmentEmailHtml(p: {
  coachName: string; refereeName: string; matchTitle: string;
  date: string; time: string; venue: string; level: string;
  appointedBy: string; portalUrl: string;
}): string {
  return baseHtml(`
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#059669;
               text-transform:uppercase;letter-spacing:1px;">Referee Assessment Coach Appointment</p>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#1f2937;">
      Assessment Appointment for ${p.coachName.split(' ')[0]}
    </h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      <strong>${p.appointedBy}</strong> has appointed you as the
      <strong>Referee Assessment Coach</strong> for the match below. Please log in to the
      EPRU Referee Portal to <strong>accept or decline</strong> this appointment.
    </p>
    ${matchCard({
    'Match': p.matchTitle,
    'Referee': p.refereeName,
    'Date': p.date,
    'Kickoff': p.time,
    'Venue': p.venue,
    'Level': p.level,
  })}
    <p style="margin:16px 0 0;font-size:13px;color:#065f46;
               background:#ecfdf5;border:1px solid #a7f3d0;
               border-radius:8px;padding:10px 14px;">
      &#128203; Your appointment invitation is waiting in your Coach Dashboard popup.
      Please respond promptly so fixture planning stays up to date.
    </p>
    ${ctaButton('Respond in Portal', p.portalUrl)}
  `);
}

function summaryEmailHtml(p: {
  coachName: string;
  notifications: Array<QueuedNotification & { id: string }>;
}): string {
  const accepted = p.notifications.filter(n => n.type === 'accepted');
  const rejected = p.notifications.filter(n => n.type === 'rejected');

  const statsRow = `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td width="50%" style="padding:16px;background:#f0fdf4;border-radius:10px 0 0 10px;
                            text-align:center;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:28px;font-weight:900;color:#059669;">${accepted.length}</p>
      <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#6b7280;
                 text-transform:uppercase;letter-spacing:1px;">Accepted</p>
    </td>
    <td width="50%" style="padding:16px;background:#fef2f2;border-radius:0 10px 10px 0;
                            text-align:center;border:1px solid #fecaca;">
      <p style="margin:0;font-size:28px;font-weight:900;color:#dc2626;">${rejected.length}</p>
      <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#6b7280;
                 text-transform:uppercase;letter-spacing:1px;">Declined</p>
    </td>
  </tr>
</table>`;

  const acceptedSection = accepted.length > 0 ? `
<p style="margin:20px 0 8px;font-size:12px;font-weight:900;color:#059669;
           text-transform:uppercase;letter-spacing:1px;">
  &#10003; Accepted (${accepted.length})
</p>
${accepted.map(n => `
<div style="margin-bottom:8px;padding:10px 14px;background:#f0fdf4;
            border-left:3px solid #059669;border-radius:0 8px 8px 0;">
  <p style="margin:0;font-size:13px;font-weight:700;color:#1f2937;">${n.matchInfo}</p>
  <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">
    ${n.refereeName} &middot; ${n.date} &middot; ${n.time} &middot; ${n.venue}
  </p>
</div>`).join('')}` : '';

  const rejectedSection = rejected.length > 0 ? `
<p style="margin:20px 0 8px;font-size:12px;font-weight:900;color:#dc2626;
           text-transform:uppercase;letter-spacing:1px;">
  &#10007; Declined (${rejected.length})
</p>
${rejected.map(n => `
<div style="margin-bottom:8px;padding:10px 14px;background:#fef2f2;
            border-left:3px solid #dc2626;border-radius:0 8px 8px 0;">
  <p style="margin:0;font-size:13px;font-weight:700;color:#1f2937;">${n.matchInfo}</p>
  <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">
    ${n.refereeName} &middot; ${n.date} &middot; ${n.time} &middot; ${n.venue}
  </p>
  ${n.reason ? `<p style="margin:4px 0 0;font-size:12px;color:#7f1d1d;font-style:italic;">
    Reason: "${n.reason}"</p>` : ''}
</div>`).join('')}` : '';

  return baseHtml(`
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1d4ed8;
               text-transform:uppercase;letter-spacing:1px;">Appointment Summary</p>
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#1f2937;">
      Hi ${p.coachName.split(' ')[0]}, here is your update
    </h2>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;line-height:1.5;">
      ${p.notifications.length} referee response${p.notifications.length !== 1 ? 's' : ''}
      since your last summary.
    </p>
    ${statsRow}
    ${acceptedSection}
    ${rejectedSection}
    ${ctaButton('View All Appointments', PORTAL_URL, '#1d4ed8')}
  `);
}