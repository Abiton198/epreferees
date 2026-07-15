/**
 * functions/src/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Cloud Functions for EPRU Referee Portal email notifications.
 *
 * Triggers:
 *   onAppointmentCreated  — coach creates appointment → referee gets email
 *   onAppointmentUpdated  — referee rejects appointment → coach gets email
 *                         — referee accepts appointment → coach gets email
 *
 * Email provider: Resend (resend.com) — free tier 3,000 emails/month
 *
 * Setup:
 *   firebase functions:secrets:set RESEND_API_KEY
 *   firebase deploy --only functions
 */

import { onDocumentCreated, onDocumentUpdated }
  from 'firebase-functions/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

admin.initializeApp();
const db = admin.firestore();
const RESEND_KEY = defineSecret('RESEND_API_KEY');
const FROM_ADDRESS = 'EPRU Referee Portal <noreply@epreferees.co.za>';
// If you don't have a custom domain yet, use Resend's sandbox:
// 'EPRU Referee Portal <onboarding@resend.dev>'


// ── Helpers ───────────────────────────────────────────────────────────────

async function getUserEmail(uid: string): Promise<string | null> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    return snap.exists ? (snap.data()?.email ?? null) : null;
  } catch {
    return null;
  }
}

async function getUserName(uid: string): Promise<string> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const d = snap.data();
    return d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'Referee' : 'Referee';
  } catch {
    return 'Referee';
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(+h, +m);
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timeStr;
  }
}


// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 1 — Coach creates appointment → email referee
// ══════════════════════════════════════════════════════════════════════════

export const onAppointmentCreated = onDocumentCreated(
  { document: 'appointments/{apptId}', secrets: [RESEND_KEY] },
  async (event) => {
    const appt = event.data?.data();
    if (!appt) return;

    const resend = new Resend(RESEND_KEY.value());
    const refereeEmail = appt.refereeEmail
      ?? await getUserEmail(appt.refereeId);
    const refereeName = appt.refereeName
      ?? await getUserName(appt.refereeId);
    const coachName = appt.coachName || 'Your coach';
    const matchDate = formatDate(appt.date);
    const matchTime = formatTime(appt.time || '');
    const portalUrl = 'https://www.epreferees.co.za';

    if (!refereeEmail) {
      console.warn('[onAppointmentCreated] No referee email for appt:', event.params.apptId);
      return;
    }

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: refereeEmail,
      subject: `📋 New Match Appointment — ${appt.homeTeam} vs ${appt.awayTeam}`,
      html: appointmentEmailHtml({
        refereeName,
        coachName,
        homeTeam: appt.homeTeam || 'TBD',
        awayTeam: appt.awayTeam || 'TBD',
        venue: appt.venue || 'TBD',
        date: matchDate,
        time: matchTime,
        role: appt.role || 'Referee',
        portalUrl,
      }),
    });

    console.log(`[Email] Appointment notification sent to ${refereeEmail}`);
  }
);


// ══════════════════════════════════════════════════════════════════════════
// TRIGGER 2 — Referee updates status → email coach
// ══════════════════════════════════════════════════════════════════════════

export const onAppointmentUpdated = onDocumentUpdated(
  { document: 'appointments/{apptId}', secrets: [RESEND_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only act when status actually changed
    if (before.status === after.status) return;

    const resend = new Resend(RESEND_KEY.value());
    const coachEmail = after.coachEmail ?? await getUserEmail(after.coachId);
    const coachName = after.coachName || 'Coach';
    const refereeName = after.refereeName
      ?? await getUserName(after.refereeId);
    const portalUrl = 'https://www.epreferees.co.za';

    if (!coachEmail) {
      console.warn('[onAppointmentUpdated] No coach email for appt:', event.params.apptId);
      return;
    }

    const matchDate = formatDate(after.date);
    const matchTime = formatTime(after.time || '');
    const matchInfo = `${after.homeTeam || 'TBD'} vs ${after.awayTeam || 'TBD'}`;

    // ── Referee REJECTED ────────────────────────────────────────────────
    if (after.status === 'rejected' && before.status !== 'rejected') {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: coachEmail,
        subject: `❌ Appointment Declined — ${matchInfo}`,
        html: rejectionEmailHtml({
          coachName,
          refereeName,
          matchInfo,
          venue: after.venue || 'TBD',
          date: matchDate,
          time: matchTime,
          reason: after.rejectionReason || 'No reason provided',
          portalUrl,
        }),
      });
      console.log(`[Email] Rejection notification sent to ${coachEmail}`);
    }

    // ── Referee ACCEPTED ────────────────────────────────────────────────
    if (after.status === 'accepted' && before.status !== 'accepted') {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: coachEmail,
        subject: `✅ Appointment Confirmed — ${matchInfo}`,
        html: acceptanceEmailHtml({
          coachName,
          refereeName,
          matchInfo,
          venue: after.venue || 'TBD',
          date: matchDate,
          time: matchTime,
          portalUrl,
        }),
      });
      console.log(`[Email] Acceptance notification sent to ${coachEmail}`);
    }
  }
);


// ══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════════════════

function baseHtml(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:16px;
                    overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#0d9488);
                     padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:700;
                      color:rgba(255,255,255,0.8);
                      text-transform:uppercase;letter-spacing:2px;">
              Eastern Province Rugby Union
            </p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:900;
                       color:#ffffff;letter-spacing:-0.5px;">
              Referee Portal
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:32px;">${content}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;
                     border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              This is an automated notification from the EPRU Referee Portal.<br/>
              Please do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Match card component used in all templates
function matchCard(fields: Record<string, string>): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0"
       style="background:#f0fdf4;border:1px solid #bbf7d0;
              border-radius:12px;margin:20px 0;">
  ${Object.entries(fields).map(([label, value]) => `
  <tr>
    <td style="padding:10px 16px;font-size:12px;font-weight:700;
               color:#6b7280;text-transform:uppercase;
               letter-spacing:1px;white-space:nowrap;width:1%;">
      ${label}
    </td>
    <td style="padding:10px 16px;font-size:13px;font-weight:600;
               color:#1f2937;">
      ${value}
    </td>
  </tr>`).join('<tr><td colspan="2" style="padding:0 16px;"><hr style="border:0;border-top:1px solid #d1fae5;margin:0;"/></td></tr>')}
</table>`;
}

function ctaButton(text: string, url: string, color = '#059669'): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
  <tr><td align="center">
    <a href="${url}"
       style="display:inline-block;padding:14px 32px;
              background:${color};color:#ffffff;
              font-size:14px;font-weight:900;
              text-decoration:none;border-radius:12px;
              letter-spacing:0.5px;">
      ${text} →
    </a>
  </td></tr>
</table>`;
}


// ── Appointment notification (to referee) ─────────────────────────────────
function appointmentEmailHtml(p: {
  refereeName: string; coachName: string; homeTeam: string; awayTeam: string;
  venue: string; date: string; time: string; role: string; portalUrl: string;
}): string {
  return baseHtml(`
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;
               color:#059669;text-transform:uppercase;letter-spacing:1px;">
      New Appointment
    </p>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#1f2937;">
      You have been appointed, ${p.refereeName.split(' ')[0]}
    </h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
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
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;
               background:#fefce8;border:1px solid #fde68a;
               border-radius:10px;padding:12px 16px;">
      ⚠️ Please respond promptly. Appointments left pending may be
      reassigned.
    </p>
    ${ctaButton('View & Respond to Appointment', p.portalUrl)}
  `);
}


// ── Rejection notification (to coach) ────────────────────────────────────
function rejectionEmailHtml(p: {
  coachName: string; refereeName: string; matchInfo: string;
  venue: string; date: string; time: string;
  reason: string; portalUrl: string;
}): string {
  return baseHtml(`
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;
               color:#dc2626;text-transform:uppercase;letter-spacing:1px;">
      Appointment Declined
    </p>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#1f2937;">
      Hi ${p.coachName.split(' ')[0]}, your appointment was declined
    </h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
      <strong>${p.refereeName}</strong> has declined the appointment below.
      Please log in to assign an alternative referee.
    </p>
    ${matchCard({
    'Match': p.matchInfo,
    'Date': p.date,
    'Time': p.time,
    'Venue': p.venue,
  })}
    <div style="margin:16px 0;background:#fef2f2;border:1px solid #fecaca;
                border-radius:10px;padding:14px 16px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;
                 color:#dc2626;text-transform:uppercase;letter-spacing:1px;">
        Reason given
      </p>
      <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.5;">
        "${p.reason}"
      </p>
    </div>
    ${ctaButton('Assign Alternative Referee', p.portalUrl, '#1d4ed8')}
  `);
}


// ── Acceptance notification (to coach) ───────────────────────────────────
function acceptanceEmailHtml(p: {
  coachName: string; refereeName: string; matchInfo: string;
  venue: string; date: string; time: string; portalUrl: string;
}): string {
  return baseHtml(`
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;
               color:#059669;text-transform:uppercase;letter-spacing:1px;">
      Appointment Confirmed
    </p>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:900;color:#1f2937;">
      Great news, ${p.coachName.split(' ')[0]}!
    </h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
      <strong>${p.refereeName}</strong> has accepted the appointment.
      Your match is confirmed.
    </p>
    ${matchCard({
    'Match': p.matchInfo,
    'Date': p.date,
    'Time': p.time,
    'Venue': p.venue,
    'Referee': p.refereeName,
  })}
    ${ctaButton('View Match Details', p.portalUrl)}
  `);
}