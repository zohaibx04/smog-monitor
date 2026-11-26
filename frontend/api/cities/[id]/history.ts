import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertMethod,
  getAdminDb,
  HttpError,
  isReadingStale,
  saveCityReadings,
  sendError,
} from '../../_lib/firebaseAdmin';
import { fetchAirQuality, type AirQualityReading } from '../../_lib/openMeteo';

interface HistoryEntry extends AirQualityReading {
  id: string;
}

function queryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET'])) return;

  try {
    const id = queryParam(req.query.id).trim();
    if (!id) {
      throw new HttpError(400, 'City ID is required.');
    }

    const rawHours = queryParam(req.query.hours).trim();
    const hours = rawHours ? Number(rawHours) : 24;
    if (!Number.isInteger(hours) || hours < 1 || hours > 2160) {
      throw new HttpError(400, 'Hours must be an integer between 1 and 2160.');
    }

    const db = getAdminDb();
    const cityRef = db.collection('globalCities').doc(id);
    const citySnap = await cityRef.get();
    if (!citySnap.exists) {
      throw new HttpError(404, 'City not found.');
    }

    const cityData = citySnap.data() ?? {};
    const cutoffMs = Date.now() - hours * 3_600_000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    const readingsSnap = await cityRef
      .collection('readings')
      .where('timestamp', '>=', cutoffIso)
      .orderBy('timestamp', 'asc')
      .get();

    let entries: HistoryEntry[] = readingsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        timestamp: String(data.timestamp ?? ''),
        aqi: typeof data.aqi === 'number' ? data.aqi : null,
        pm25: typeof data.pm25 === 'number' ? data.pm25 : null,
        pm10: typeof data.pm10 === 'number' ? data.pm10 : null,
        source: String(data.source ?? 'Open-Meteo / CAMS model estimate'),
      };
    });

    const latestTs = entries.length > 0 ? entries[entries.length - 1].timestamp : null;
    const earliestTs = entries.length > 0 ? entries[0].timestamp : null;
    const missingWindow =
      hours > 24 &&
      earliestTs !== null &&
      Date.parse(earliestTs) - cutoffMs > 12 * 3_600_000 &&
      entries.length < Math.min(hours - 6, 48);

    if (entries.length === 0 || isReadingStale(latestTs) || missingWindow) {
      const latitude = Number(cityData.latitude);
      const longitude = Number(cityData.longitude);

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        try {
          const pastDays = Math.min(92, Math.max(7, Math.ceil(hours / 24)));
          const fetched = await fetchAirQuality(latitude, longitude, pastDays);
          await saveCityReadings(id, fetched.readings);

          const nowIso = new Date().toISOString();
          const stale = isReadingStale(fetched.latest?.timestamp);
          await cityRef.set(
            {
              latestReading: fetched.latest,
              stale,
              lastError: stale
                ? 'Open-Meteo did not return a recent air-quality estimate.'
                : null,
              updatedAt: nowIso,
            },
            { merge: true },
          );

          const merged = new Map<string, HistoryEntry>();
          for (const item of entries) {
            merged.set(item.timestamp, item);
          }
          for (const item of fetched.readings) {
            if (Date.parse(item.timestamp) >= cutoffMs) {
              merged.set(item.timestamp, {
                id: item.timestamp.replace(/[:.]/g, '-'),
                ...item,
              });
            }
          }
          entries = Array.from(merged.values());
        } catch (err: unknown) {
          if (entries.length === 0) {
            throw err;
          }
        }
      }
    }

    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    res.status(200).json(entries);
  } catch (err) {
    sendError(res, err);
  }
}
