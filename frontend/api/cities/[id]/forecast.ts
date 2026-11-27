import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertMethod,
  getAdminDb,
  HttpError,
  sendError,
  verifyAuth,
} from '../../_lib/firebaseAdmin.js';
import { fetchProactiveInsights } from '../../_lib/openMeteo.js';

function queryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function parseOptionalCoord(raw: string, min: number, max: number, label: string): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  }
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET'])) return;

  try {
    await verifyAuth(req);

    const id = queryParam(req.query.id).trim();
    const rawLat = queryParam(req.query.lat).trim();
    const rawLon = queryParam(req.query.lon).trim();

    const fallbackLat = parseOptionalCoord(rawLat, -90, 90, 'Latitude');
    const fallbackLon = parseOptionalCoord(rawLon, -180, 180, 'Longitude');
    const hasFallbackCoords = fallbackLat !== null && fallbackLon !== null;

    let latitude: number | null = null;
    let longitude: number | null = null;

    if (id) {
      try {
        const db = getAdminDb();
        const citySnap = await db.collection('globalCities').doc(id).get();
        if (citySnap.exists) {
          const data = citySnap.data() ?? {};
          const docLat = Number(data.latitude);
          const docLon = Number(data.longitude);
          if (Number.isFinite(docLat) && Number.isFinite(docLon)) {
            latitude = docLat;
            longitude = docLon;
          }
        }
      } catch (err) {
        if (!hasFallbackCoords) {
          throw err;
        }
      }
    }

    if (latitude === null || longitude === null) {
      if (hasFallbackCoords) {
        latitude = fallbackLat;
        longitude = fallbackLon;
      } else if (!id) {
        throw new HttpError(400, 'Provide a city ID or valid lat and lon query parameters.');
      } else {
        throw new HttpError(404, 'City not found.');
      }
    }

    const insights = await fetchProactiveInsights(latitude, longitude);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).json(insights);
  } catch (err) {
    sendError(res, err);
  }
}
