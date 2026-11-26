import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertMethod,
  getAdminDb,
  HttpError,
  isReadingStale,
  normalizeCityName,
  parseJsonBody,
  requireAdmin,
  saveCityReadings,
  sendError,
} from '../_lib/firebaseAdmin';
import { fetchAirQuality } from '../_lib/openMeteo';

interface CityBody {
  id?: unknown;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  active?: unknown;
  isStarter?: unknown;
}

function queryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function slugifyCityId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `city-${Date.now()}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET', 'POST', 'PUT', 'DELETE'])) return;

  try {
    await requireAdmin(req);
    const db = getAdminDb();
    const citiesCol = db.collection('globalCities');

    if (req.method === 'GET') {
      const snap = await citiesCol.orderBy('name', 'asc').get();
      const cities = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      res.status(200).json({ cities });
      return;
    }

    if (req.method === 'POST') {
      const body = parseJsonBody<CityBody>(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const latitude = typeof body.latitude === 'number' ? body.latitude : Number(body.latitude);
      const longitude = typeof body.longitude === 'number' ? body.longitude : Number(body.longitude);
      const active = typeof body.active === 'boolean' ? body.active : true;
      const isStarter = typeof body.isStarter === 'boolean' ? body.isStarter : false;

      if (!name || name.length > 80) {
        throw new HttpError(400, 'City name must be between 1 and 80 characters.');
      }
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new HttpError(400, 'Latitude must be between -90 and 90.');
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new HttpError(400, 'Longitude must be between -180 and 180.');
      }

      const normalizedName = normalizeCityName(name);
      const existingSnap = await citiesCol
        .where('normalizedName', '==', normalizedName)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        throw new HttpError(409, `City "${name}" already exists in the global catalog.`);
      }

      const candidateId = slugifyCityId(name);
      const existingById = await citiesCol.doc(candidateId).get();
      const docRef = existingById.exists ? citiesCol.doc() : citiesCol.doc(candidateId);
      const nowIso = new Date().toISOString();

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

      const cityData = {
        name,
        normalizedName,
        latitude,
        longitude,
        active,
        isStarter,
        customLocation: !isStarter,
        watchlistCount: 0,
        latestReading,
        stale,
        lastError,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await docRef.set(cityData);
      if (readingsToSave.length > 0) {
        await saveCityReadings(docRef.id, readingsToSave);
      }

      res.status(201).json({
        city: {
          id: docRef.id,
          ...cityData,
        },
      });
      return;
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody<CityBody>(req);
      const id = (typeof body.id === 'string' ? body.id : queryParam(req.query.id)).trim();
      if (!id) {
        throw new HttpError(400, 'City id is required.');
      }

      const cityRef = citiesCol.doc(id);
      const citySnap = await cityRef.get();
      if (!citySnap.exists) {
        throw new HttpError(404, 'City not found.');
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 80) {
          throw new HttpError(400, 'City name must be between 1 and 80 characters.');
        }
        updates.name = name;
        updates.normalizedName = normalizeCityName(name);
      }
      if (body.latitude !== undefined) {
        const lat = typeof body.latitude === 'number' ? body.latitude : Number(body.latitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          throw new HttpError(400, 'Latitude must be between -90 and 90.');
        }
        updates.latitude = lat;
      }
      if (body.longitude !== undefined) {
        const lon = typeof body.longitude === 'number' ? body.longitude : Number(body.longitude);
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
          throw new HttpError(400, 'Longitude must be between -180 and 180.');
        }
        updates.longitude = lon;
      }
      if (body.active !== undefined) {
        if (typeof body.active !== 'boolean') {
          throw new HttpError(400, 'active must be a boolean.');
        }
        updates.active = body.active;
      }
      if (body.isStarter !== undefined) {
        if (typeof body.isStarter !== 'boolean') {
          throw new HttpError(400, 'isStarter must be a boolean.');
        }
        updates.isStarter = body.isStarter;
      }

      await cityRef.set(updates, { merge: true });
      const updatedSnap = await cityRef.get();
      res.status(200).json({
        city: {
          id: updatedSnap.id,
          ...updatedSnap.data(),
        },
      });
      return;
    }

    const body = parseJsonBody<CityBody>(req);
    const id = (queryParam(req.query.id) || (typeof body.id === 'string' ? body.id : '')).trim();
    if (!id) {
      throw new HttpError(400, 'City id is required.');
    }

    const cityRef = citiesCol.doc(id);
    const citySnap = await cityRef.get();
    if (!citySnap.exists) {
      throw new HttpError(404, 'City not found.');
    }

    await db.recursiveDelete(cityRef);
    res.status(200).json({ deleted: true, id });
  } catch (err) {
    sendError(res, err);
  }
}
