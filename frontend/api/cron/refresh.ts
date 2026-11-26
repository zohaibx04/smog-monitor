import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendThresholdAlertEmail } from '../_lib/email.js';
import {
  assertMethod,
  extractBearerToken,
  getAdminDb,
  HttpError,
  isReadingStale,
  requireAdmin,
  saveCityReadings,
  sendError,
} from '../_lib/firebaseAdmin.js';
import { fetchAirQuality, type AirQualityReading } from '../_lib/openMeteo.js';

const CONCURRENCY_LIMIT = 5;

function isCronSecretValid(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const token = extractBearerToken(req);
  if (!secret || !token) return false;

  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authorizeRefresh(req: VercelRequest): Promise<void> {
  if (isCronSecretValid(req)) return;
  try {
    await requireAdmin(req);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'Unauthorized cron or admin refresh request.');
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET', 'POST'])) return;

  try {
    await authorizeRefresh(req);

    const db = getAdminDb();
    const nowIso = new Date().toISOString();
    const activeCitiesSnap = await db
      .collection('globalCities')
      .where('active', '==', true)
      .get();

    const latestByCity = new Map<
      string,
      { name: string; latest: AirQualityReading | null }
    >();
    let refreshed = 0;
    let errors = 0;

    await runWithConcurrency(activeCitiesSnap.docs, CONCURRENCY_LIMIT, async (cityDoc) => {
      const data = cityDoc.data();
      const cityName = String(data.name ?? cityDoc.id);
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      const prevLatest = data.latestReading as AirQualityReading | null | undefined;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        errors += 1;
        await cityDoc.ref.set(
          {
            stale: true,
            lastError: 'Invalid city coordinates.',
            updatedAt: nowIso,
          },
          { merge: true },
        );
        return;
      }

      try {
        const fetched = await fetchAirQuality(latitude, longitude, 2);
        const minTimestamp = prevLatest?.timestamp ?? null;
        await saveCityReadings(cityDoc.id, fetched.readings, minTimestamp);

        const latest = fetched.latest ?? prevLatest ?? null;
        const stale = isReadingStale(latest?.timestamp);
        const lastError = stale
          ? 'Open-Meteo did not return a recent air-quality estimate.'
          : null;

        await cityDoc.ref.set(
          {
            latestReading: latest,
            stale,
            lastError,
            updatedAt: nowIso,
          },
          { merge: true },
        );

        latestByCity.set(cityDoc.id, { name: cityName, latest });
        refreshed += 1;
      } catch (err: unknown) {
        errors += 1;
        const message = err instanceof Error ? err.message : 'Open-Meteo refresh failed.';
        await cityDoc.ref.set(
          {
            stale: true,
            lastError: message,
            updatedAt: nowIso,
          },
          { merge: true },
        );
      }
    });

    const rulesSnap = await db
      .collectionGroup('alertRules')
      .where('enabled', '==', true)
      .get();

    const userCache = new Map<string, FirebaseFirestore.DocumentData | null>();
    let alertsCreated = 0;
    let emailsSent = 0;

    for (const ruleDoc of rulesSnap.docs) {
      const uid = ruleDoc.ref.parent.parent?.id;
      if (!uid) continue;

      const rule = ruleDoc.data();
      const cityId = String(rule.cityId ?? rule.cityDocId ?? '');
      if (!cityId) continue;

      let cityEntry = latestByCity.get(cityId);
      if (!cityEntry) {
        const citySnap = await db.collection('globalCities').doc(cityId).get();
        if (!citySnap.exists) continue;
        const cityData = citySnap.data() ?? {};
        if (cityData.active === false) continue;
        cityEntry = {
          name: String(cityData.name ?? rule.cityName ?? cityId),
          latest: (cityData.latestReading as AirQualityReading | null) ?? null,
        };
        latestByCity.set(cityId, cityEntry);
      }

      const fresh = cityEntry.latest;
      if (!fresh || fresh.aqi == null || !Number.isFinite(fresh.aqi)) continue;

      const aqi = fresh.aqi;
      const threshold = Number(rule.aqiThreshold);
      if (!Number.isFinite(threshold)) continue;

      const aboveThreshold = Boolean(rule.aboveThreshold);
      const cityName = String(rule.cityName ?? cityEntry.name);

      if (aqi > threshold && !aboveThreshold) {
        let userData = userCache.get(uid);
        if (userData === undefined) {
          const userSnap = await db.collection('users').doc(uid).get();
          userData = userSnap.exists ? (userSnap.data() ?? null) : null;
          userCache.set(uid, userData);
        }

        let emailSent = false;
        const userEmail = typeof userData?.email === 'string' ? userData.email.trim() : '';
        const userAlertsEnabled = userData?.emailAlertsEnabled !== false;

        if (rule.emailNotify === true && userAlertsEnabled && userEmail) {
          const emailRes = await sendThresholdAlertEmail({
            uid,
            toEmail: userEmail,
            cityName,
            aqi,
            pm25: fresh.pm25,
            pm10: fresh.pm10,
            threshold,
            appUrl: process.env.APP_URL,
          });
          if (emailRes.status === 'sent') {
            emailSent = true;
            emailsSent += 1;
          }
        }

        const userRef = db.collection('users').doc(uid);
        await userRef.collection('alerts').add({
          cityId,
          areaId: typeof rule.areaId === 'number' ? rule.areaId : null,
          cityName,
          ruleId: ruleDoc.id,
          aqi,
          pm25: fresh.pm25,
          pm10: fresh.pm10,
          threshold,
          message: `${cityName} reached US AQI ${Math.round(aqi)} (above threshold ${Math.round(threshold)}).`,
          status: 'Active',
          emailSent,
          createdAt: nowIso,
          resolvedAt: null,
        });

        await ruleDoc.ref.set(
          {
            aboveThreshold: true,
            lastEvaluatedAt: nowIso,
          },
          { merge: true },
        );
        alertsCreated += 1;
      } else if (aqi <= threshold && aboveThreshold) {
        const userAlertsCol = db.collection('users').doc(uid).collection('alerts');
        const activeRuleAlerts = await userAlertsCol
          .where('ruleId', '==', ruleDoc.id)
          .where('status', '==', 'Active')
          .get();

        const batch = db.batch();
        for (const alertDoc of activeRuleAlerts.docs) {
          batch.update(alertDoc.ref, {
            status: 'Resolved',
            resolvedAt: nowIso,
          });
        }
        batch.set(
          ruleDoc.ref,
          {
            aboveThreshold: false,
            lastEvaluatedAt: nowIso,
          },
          { merge: true },
        );
        await batch.commit();
      } else {
        await ruleDoc.ref.set({ lastEvaluatedAt: nowIso }, { merge: true });
      }
    }

    res.status(200).json({
      refreshed,
      errors,
      alertsCreated,
      emailsSent,
    });
  } catch (err) {
    sendError(res, err);
  }
}
