import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  assertMethod,
  getAdminDb,
  HttpError,
  isReadingStale,
  normalizeCityName,
  parseJsonBody,
  saveCityReadings,
  sendError,
  verifyAuth,
} from '../_lib/firebaseAdmin';
import { fetchAirQuality } from '../_lib/openMeteo';

interface EnsureCityBody {
  docId?: unknown;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

const PROXIMITY_DEG = 0.05;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['POST'])) return;

  try {
    const user = await verifyAuth(req);
    const body = parseJsonBody<EnsureCityBody>(req);

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const latitude = typeof body.latitude === 'number' ? body.latitude : Number(body.latitude);
    const longitude = typeof body.longitude === 'number' ? body.longitude : Number(body.longitude);

    if (!name || name.length > 80) {
      throw new HttpError(400, 'City name must be between 1 and 80 characters.');
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new HttpError(400, 'Latitude must be between -90 and 90.');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new HttpError(400, 'Longitude must be between -180 and 180.');
    }

    const db = getAdminDb();
    const citiesCol = db.collection('globalCities');
    const normalizedTarget = normalizeCityName(name);
    const requestedDocId = typeof body.docId === 'string' ? body.docId.trim() : '';

    let matchedDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (requestedDocId) {
      const byIdSnap = await citiesCol.doc(requestedDocId).get();
      if (byIdSnap.exists) {
        matchedDoc = byIdSnap;
      }
    }

    if (!matchedDoc) {
      const byNameSnap = await citiesCol
        .where('normalizedName', '==', normalizedTarget)
        .limit(1)
        .get();

      if (!byNameSnap.empty) {
        matchedDoc = byNameSnap.docs[0];
      } else {
        const allCitiesSnap = await citiesCol.get();
        for (const doc of allCitiesSnap.docs) {
          const data = doc.data();
          const docName = typeof data.name === 'string' ? normalizeCityName(data.name) : '';
          const docLat = Number(data.latitude);
          const docLon = Number(data.longitude);
          const closeCoords =
            Number.isFinite(docLat) &&
            Number.isFinite(docLon) &&
            Math.abs(docLat - latitude) <= PROXIMITY_DEG &&
            Math.abs(docLon - longitude) <= PROXIMITY_DEG;

          if (docName === normalizedTarget || closeCoords) {
            matchedDoc = doc;
            break;
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    let cityId: string;
    let cityRecord: Record<string, unknown>;

    if (matchedDoc && matchedDoc.exists) {
      const existingData = matchedDoc.data() ?? {};
      cityId = matchedDoc.id;
      cityRecord = { id: cityId, ...existingData };

      const needsBackfill =
        !existingData.latestReading ||
        isReadingStale((existingData.latestReading as { timestamp?: string } | undefined)?.timestamp);

      if (needsBackfill) {
        try {
          const aq = await fetchAirQuality(
            Number(existingData.latitude ?? latitude),
            Number(existingData.longitude ?? longitude),
            7,
          );
          await saveCityReadings(cityId, aq.readings);
          const stale = isReadingStale(aq.latest?.timestamp);
          const patch = {
            latestReading: aq.latest,
            stale,
            lastError: stale ? 'Open-Meteo did not return a recent air-quality estimate.' : null,
            updatedAt: nowIso,
          };
          await matchedDoc.ref.set(patch, { merge: true });
          cityRecord = { ...cityRecord, ...patch };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Open-Meteo fetch failed.';
          await matchedDoc.ref.set(
            { stale: true, lastError: message, updatedAt: nowIso },
            { merge: true },
          );
          cityRecord = { ...cityRecord, stale: true, lastError: message, updatedAt: nowIso };
        }
      }
    } else {
      const newCityRef = citiesCol.doc();
      cityId = newCityRef.id;

      let latestReading = null;
      let stale = true;
      let lastError: string | null = null;
      let readingsToSave: Awaited<ReturnType<typeof fetchAirQuality>>['readings'] = [];

      try {
        const aq = await fetchAirQuality(latitude, longitude, 7);
        latestReading = aq.latest;
        readingsToSave = aq.readings;
        stale = isReadingStale(aq.latest?.timestamp);
        lastError = stale ? 'Open-Meteo did not return a recent air-quality estimate.' : null;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : 'Open-Meteo fetch failed.';
      }

      cityRecord = {
        name,
        normalizedName: normalizedTarget,
        latitude,
        longitude,
        active: true,
        isStarter: false,
        customLocation: true,
        watchlistCount: 0,
        latestReading,
        stale,
        lastError,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await newCityRef.set(cityRecord);
      if (readingsToSave.length > 0) {
        await saveCityReadings(cityId, readingsToSave);
      }
      cityRecord = { id: cityId, ...cityRecord };
    }

    const watchlistRef = db
      .collection('users')
      .doc(user.uid)
      .collection('watchlist')
      .doc(cityId);
    const watchlistSnap = await watchlistRef.get();

    let added = false;
    if (!watchlistSnap.exists) {
      await watchlistRef.set({
        cityId,
        name: String(cityRecord.name ?? name),
        latitude: Number(cityRecord.latitude ?? latitude),
        longitude: Number(cityRecord.longitude ?? longitude),
        addedAt: nowIso,
      });
      await citiesCol.doc(cityId).update({
        watchlistCount: FieldValue.increment(1),
      });
      cityRecord.watchlistCount = Number(cityRecord.watchlistCount ?? 0) + 1;
      added = true;
    }

    res.status(200).json({
      cityId,
      city: cityRecord,
      added,
    });
  } catch (err) {
    sendError(res, err);
  }
}
