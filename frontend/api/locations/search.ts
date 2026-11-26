import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertMethod, HttpError, sendError } from '../_lib/firebaseAdmin';
import { searchLocations } from '../_lib/openMeteo';

function queryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET'])) return;

  try {
    const q = queryParam(req.query.q).trim();
    const country = queryParam(req.query.country).trim();

    if (q.length < 2 || q.length > 100) {
      throw new HttpError(400, 'Enter a location query between 2 and 100 characters.');
    }
    if (country && !/^[A-Za-z]{2}$/.test(country)) {
      throw new HttpError(400, 'Country code must be a two-letter ISO code.');
    }

    const places = await searchLocations(q, country || undefined);
    res.status(200).json(places);
  } catch (err) {
    sendError(res, err);
  }
}
