/**
 * functions/src/index.ts — EPRU Referee Portal email notifications v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Email strategy (optimised for free tier):
 *
 *   REFEREES  → immediate individual email on every new appointment
 *   COACHES   → NO individual emails — batched summary every 20 responses
 *
 * Firestore collections:
 *   coachNotificationQueue/{docId}  — one doc per queued coach notification
 *   coachSummaryCounters/{coachId}  — pending count + flush lock per coach
 *   emailQueue/{docId}              — failed emails awaiting retry
 *
 * Concurrency note:
 *   coachSummaryCounters/{coachId} carries a `flushInProgress` flag that is
 *   claimed transactionally. Only the caller that successfully flips it
 *   false → true (in the SAME transaction as the count increment) is allowed
 *   to send the summary email. This prevents two near-simultaneous referee
 *   responses from both triggering a flush at the 20-item threshold. The
 *   lock is always released in a `finally`, so a failed send self-heals on
 *   the next event or the daily cron.
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

async function getUserEmail(uid: string): Promise<string | null> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    return snap.exists ? (snap.data()?.email ?? null) : null;
  } catch { return null; }
}

async function getUserName(uid: string): Promise<string> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const d = snap.data();
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'Referee' : 'Referee';
  } catch { return 'Referee'; }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return dateStr; }
}

function formatTime(timeStr: string): string {
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
  payload: { from: string; to: string; subject: string; html: string },
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


// ══════════════════════════════════════════════════════════════════════════
// COACH NOTIFICATION QUEUE
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

/**
 * Atomically increments the pending counter for a coach. If the counter
 * crosses SUMMARY_THRESHOLD and no flush is already in progress, this also
 * claims the flush lock (flushInProgress: true) in the SAME transaction, so
 * exactly one caller — even under concurrent writes — gets shouldSend=true.
 */
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
      flushInProgress: locked || shouldSend, // claim lock if we're triggering
      coachEmail,
      coachName,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { shouldSend, count: next };
  });
}

/**
 * Transactionally attempts to claim the flush lock without an increment.
 * Used by the daily catch-up cron so it never races a live threshold flush.
 */
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

/**
 * Sends the batched summary email for a coach. Caller MUST already hold the
 * flush lock (flushInProgress: true) before calling this. The lock is
 * always released on the way out — on success the counter is also reset to
 * 0 so the next batch starts clean; on failure only the lock is released,
 * leaving pendingCount untouched so the next referee response (or the daily
 * cron) retries the flush automatically.
 */
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
      await releaseFlushLock(coachId, /* resetCount */ true);
      return;
    }

    const notifications = snap.docs.map(d => ({
      id: d.id, ...(d.data() as QueuedNotification),
    }));

    await sendOrQueue(resend, {
      from: FROM_ADDRESS,
      to: coachEmail,
      subject: `📊 Appointment Summary — ${notifications.length} updates`,
      html: summaryEmailHtml({ coachName, notifications }),
    });

    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { sent: true }));
    await batch.commit();

    await releaseFlushLock(coachId, /* resetCount */ true);
    console.log(`[Summary] Sent ${notifications.length} items to ${coachEmail}`);
  } catch (err) {
    // Release the lock so the next event or daily cron can retry; leave
    // pendingCount as-is since the underlying notifications are still unsent.
    await releaseFlushLock(coachId, /* resetCount */ false);
    console.error(`[Summary] Flush failed for ${coachId}:`, err);
    throw err;
  }
}


// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 1 — Appointment created → email referee immediately
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
    const refereeEmail = appt.refereeEmail ?? await getUserEmail(appt.refereeId);
    const refereeName = appt.refereeName ?? await getUserName(appt.refereeId);

    if (!refereeEmail) {
      console.warn('[Created] No referee email:', event.params.apptId);
      return;
    }

    await sendOrQueue(resend, {
      from: FROM_ADDRESS,
      to: refereeEmail,
      subject: `📋 New Match Appointment — ${appt.homeTeam} vs ${appt.awayTeam}`,
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
  }
);


// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 2 — Referee responds → queue for coach batch summary
// ══════════════════════════════════════════════════════════════════════════

export const onAppointmentUpdated = onDocumentUpdated(
  { document: 'appointments/{apptId}', secrets: [RESEND_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === after.status) return;

    const isAccepted = after.status === 'accepted' && before.status !== 'accepted';
    const isRejected = after.status === 'rejected' && before.status !== 'rejected';
    if (!isAccepted && !isRejected) return;

    const resend = new Resend(RESEND_KEY.value());
    const coachId = after.coachId;
    const coachEmail = after.coachEmail ?? await getUserEmail(coachId);
    const coachName = after.coachName || 'Coach';
    const refereeName = after.refereeName ?? await getUserName(after.refereeId);

    if (!coachEmail || !coachId) {
      console.warn('[Updated] No coach info:', event.params.apptId);
      return;
    }

    const { shouldSend } = await queueCoachNotification(
      coachId, coachEmail, coachName,
      {
        type: isAccepted ? 'accepted' : 'rejected',
        refereeName,
        matchInfo: `${after.homeTeam || 'TBD'} vs ${after.awayTeam || 'TBD'}`,
        date: formatDate(after.date || after.matchDate || ''),
        time: formatTime(after.time || after.matchTime || ''),
        venue: after.venue || 'TBD',
        reason: isRejected
          ? (after.rejectionReason || after.declineReason || 'No reason provided')
          : null,
      },
    );

    if (shouldSend) {
      await flushCoachSummary(resend, coachId, coachEmail, coachName);
    }
  }
);


// ══════════════════════════════════════════════════════════════════════════
// SCHEDULED — Daily 08:00: flush any coach with pending notifications
// Ensures coaches receive updates even if threshold not yet reached
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

      // Skip coaches whose flush is already in progress via the live trigger
      // to avoid sending the same batch twice.
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