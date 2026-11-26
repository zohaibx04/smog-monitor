import { getAdminDb } from './firebaseAdmin.js';

export interface ThresholdAlertEmailInput {
  uid: string;
  toEmail: string;
  cityName: string;
  aqi: number;
  pm25: number | null;
  pm10: number | null;
  threshold: number;
  appUrl?: string;
}

export interface EmailSendResult {
  status: 'sent' | 'failed' | 'skipped';
  providerId: string | null;
  error: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAqiSeverity(aqi: number): { label: string; color: string; bg: string } {
  if (aqi <= 50) return { label: 'Good', color: '#34d399', bg: '#112922' };
  if (aqi <= 100) return { label: 'Moderate', color: '#fbbf24', bg: '#2a2210' };
  if (aqi <= 150) return { label: 'Sensitive', color: '#fb923c', bg: '#2b1d12' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#f87171', bg: '#2c1518' };
  if (aqi <= 300) return { label: 'Very Unhealthy', color: '#c084fc', bg: '#241730' };
  return { label: 'Hazardous', color: '#fb7185', bg: '#2e111b' };
}

function formatMetric(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return 'â€”';
  return `${Math.round(value * 10) / 10} ${unit}`;
}

function buildAlertHtml(input: ThresholdAlertEmailInput, resolvedAppUrl: string): string {
  const severity = getAqiSeverity(input.aqi);
  const safeCity = escapeHtml(input.cityName);
  const safeUrl = escapeHtml(resolvedAppUrl);
  const roundedAqi = Math.round(input.aqi);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Smog Alert: ${safeCity}</title>
</head>
<body style="margin:0;padding:24px 16px;background:#0e1116;color:#e5e9f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#161b22;border:1px solid #262e39;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #262e39;background:#12161c;">
        <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#8b95a5;font-weight:600;">Smog Monitoring &amp; Alert System</div>
        <h1 style="margin:6px 0 0;font-size:20px;font-weight:600;color:#f3f6fa;">Air Quality Threshold Exceeded</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <div style="margin-bottom:16px;">
          <div style="font-size:13px;color:#9aa4b2;margin-bottom:4px;">Monitored Location</div>
          <div style="font-size:18px;font-weight:600;color:#ffffff;">${safeCity}</div>
        </div>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#10141a;border:1px solid #262e39;border-radius:8px;margin-bottom:20px;">
          <tr>
            <td style="padding:16px;border-right:1px solid #262e39;width:34%;">
              <div style="font-size:11px;text-transform:uppercase;color:#8b95a5;margin-bottom:6px;">US AQI</div>
              <div style="font-size:28px;font-weight:700;color:${severity.color};font-variant-numeric:tabular-nums;">${roundedAqi}</div>
              <div style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${severity.color};background:${severity.bg};">${escapeHtml(severity.label)}</div>
            </td>
            <td style="padding:16px;border-right:1px solid #262e39;width:33%;vertical-align:top;">
              <div style="font-size:11px;text-transform:uppercase;color:#8b95a5;margin-bottom:6px;">PM2.5</div>
              <div style="font-size:17px;font-weight:600;color:#e5e9f0;font-variant-numeric:tabular-nums;">${escapeHtml(formatMetric(input.pm25, 'Âµg/mÂ³'))}</div>
              <div style="font-size:11px;color:#8b95a5;margin-top:10px;">Your Threshold</div>
              <div style="font-size:14px;font-weight:600;color:#e5e9f0;font-variant-numeric:tabular-nums;">AQI &gt; ${Math.round(input.threshold)}</div>
            </td>
            <td style="padding:16px;width:33%;vertical-align:top;">
              <div style="font-size:11px;text-transform:uppercase;color:#8b95a5;margin-bottom:6px;">PM10</div>
              <div style="font-size:17px;font-weight:600;color:#e5e9f0;font-variant-numeric:tabular-nums;">${escapeHtml(formatMetric(input.pm10, 'Âµg/mÂ³'))}</div>
              <div style="font-size:11px;color:#8b95a5;margin-top:10px;">Source</div>
              <div style="font-size:12px;color:#c0c8d4;">Open-Meteo / CAMS</div>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#b4becb;">
          Current air quality in <strong style="color:#ffffff;">${safeCity}</strong> is <strong style="color:${severity.color};">${roundedAqi} US AQI</strong>, exceeding your configured alert threshold of <strong>${Math.round(input.threshold)}</strong>. Limit prolonged outdoor exertion if sensitive.
        </p>

        <a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#2dd4bf;color:#0b1115;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">
          Open Live Dashboard
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 24px;border-top:1px solid #262e39;background:#12161c;font-size:12px;color:#7c8696;">
        You received this alert because email notifications are enabled for your watchlist rules.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function logEmailAttempt(
  input: ThresholdAlertEmailInput,
  result: EmailSendResult,
): Promise<void> {
  try {
    await getAdminDb().collection('emailLogs').add({
      uid: input.uid,
      toEmail: input.toEmail,
      cityName: input.cityName,
      aqi: input.aqi,
      threshold: input.threshold,
      status: result.status,
      providerId: result.providerId,
      error: result.error,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[emailLogs] Failed to record email log:', err);
  }
}

export async function sendThresholdAlertEmail(
  input: ThresholdAlertEmailInput,
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = input.toEmail?.trim();

  if (!recipient) {
    const skipped: EmailSendResult = {
      status: 'skipped',
      providerId: null,
      error: 'Missing recipient email address.',
    };
    await logEmailAttempt(input, skipped);
    return skipped;
  }

  if (!apiKey) {
    const skipped: EmailSendResult = {
      status: 'skipped',
      providerId: null,
      error: 'RESEND_API_KEY is not configured.',
    };
    await logEmailAttempt(input, skipped);
    return skipped;
  }

  const fromEmail =
    process.env.ALERT_FROM_EMAIL?.trim() || 'Smog Monitor <onboarding@resend.dev>';
  const resolvedAppUrl =
    input.appUrl?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://smog-monitor.vercel.app');

  const roundedAqi = Math.round(input.aqi);
  const subject = `[Smog Alert] ${input.cityName} reached US AQI ${roundedAqi} (>${Math.round(input.threshold)})`;
  const html = buildAlertHtml(input, resolvedAppUrl);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;

    if (!response.ok) {
      const failed: EmailSendResult = {
        status: 'failed',
        providerId: null,
        error: data?.message || `Resend returned HTTP ${response.status}.`,
      };
      await logEmailAttempt(input, failed);
      return failed;
    }

    const sent: EmailSendResult = {
      status: 'sent',
      providerId: data?.id ?? null,
      error: null,
    };
    await logEmailAttempt(input, sent);
    return sent;
  } catch (err: unknown) {
    const failed: EmailSendResult = {
      status: 'failed',
      providerId: null,
      error: err instanceof Error ? err.message : 'Resend request failed.',
    };
    await logEmailAttempt(input, failed);
    return failed;
  }
}
