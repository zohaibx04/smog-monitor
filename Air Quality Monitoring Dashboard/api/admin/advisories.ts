import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertMethod,
  getAdminDb,
  HttpError,
  parseJsonBody,
  requireAdmin,
  sendError,
} from '../_lib/firebaseAdmin';

type ItemKind = 'advisory' | 'rule';

interface AdvisoryOrRuleBody {
  kind?: unknown;
  id?: unknown;
  title?: unknown;
  message?: unknown;
  severity?: unknown;
  active?: unknown;
  cityId?: unknown;
  cityName?: unknown;
  aqiThreshold?: unknown;
  enabled?: unknown;
  emailNotify?: unknown;
  description?: unknown;
}

function queryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function resolveKind(raw: unknown): ItemKind {
  if (raw === 'advisory' || raw === 'rule') return raw;
  throw new HttpError(400, 'Specify kind as "advisory" or "rule".');
}

function collectionForKind(kind: ItemKind): 'systemAdvisories' | 'systemRules' {
  return kind === 'advisory' ? 'systemAdvisories' : 'systemRules';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET', 'POST', 'PUT', 'DELETE'])) return;

  try {
    const admin = await requireAdmin(req);
    const db = getAdminDb();

    if (req.method === 'GET') {
      const requestedKind = queryParam(req.query.kind).trim();
      const [advisoriesSnap, rulesSnap] = await Promise.all([
        db.collection('systemAdvisories').orderBy('createdAt', 'desc').get(),
        db.collection('systemRules').orderBy('createdAt', 'desc').get(),
      ]);

      const advisories = advisoriesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const rules = rulesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      if (requestedKind === 'advisory') {
        res.status(200).json({ kind: 'advisory', items: advisories, advisories, rules });
        return;
      }
      if (requestedKind === 'rule') {
        res.status(200).json({ kind: 'rule', items: rules, advisories, rules });
        return;
      }

      res.status(200).json({ advisories, rules });
      return;
    }

    const body = parseJsonBody<AdvisoryOrRuleBody>(req);
    const rawKind = body.kind ?? queryParam(req.query.kind);
    const kind = resolveKind(rawKind);
    const collectionName = collectionForKind(kind);
    const col = db.collection(collectionName);
    const nowIso = new Date().toISOString();

    if (req.method === 'POST') {
      if (kind === 'advisory') {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        const severity =
          body.severity === 'warning' || body.severity === 'critical' ? body.severity : 'info';
        const active = typeof body.active === 'boolean' ? body.active : true;
        const cityId = typeof body.cityId === 'string' && body.cityId.trim() ? body.cityId.trim() : null;

        if (!title || title.length > 120) {
          throw new HttpError(400, 'Advisory title must be between 1 and 120 characters.');
        }
        if (!message || message.length > 500) {
          throw new HttpError(400, 'Advisory message must be between 1 and 500 characters.');
        }

        const payload = {
          title,
          message,
          severity,
          active,
          cityId,
          createdBy: admin.uid,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        const ref = await col.add(payload);
        res.status(201).json({ kind, item: { id: ref.id, ...payload } });
        return;
      }

      const cityId = typeof body.cityId === 'string' ? body.cityId.trim() : '';
      let cityName = typeof body.cityName === 'string' ? body.cityName.trim() : '';
      const aqiThreshold = Number(body.aqiThreshold);
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
      const emailNotify = typeof body.emailNotify === 'boolean' ? body.emailNotify : false;
      const description = typeof body.description === 'string' ? body.description.trim() : '';

      if (!cityId) {
        throw new HttpError(400, 'cityId is required for a system rule.');
      }
      if (!Number.isFinite(aqiThreshold) || aqiThreshold < 1 || aqiThreshold > 500) {
        throw new HttpError(400, 'aqiThreshold must be between 1 and 500.');
      }

      if (!cityName) {
        const citySnap = await db.collection('globalCities').doc(cityId).get();
        if (!citySnap.exists) {
          throw new HttpError(404, 'Referenced city not found.');
        }
        cityName = String(citySnap.data()?.name ?? cityId);
      }

      const payload = {
        cityId,
        cityName,
        aqiThreshold: Math.round(aqiThreshold),
        enabled,
        emailNotify,
        description,
        createdBy: admin.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const ref = await col.add(payload);
      res.status(201).json({ kind, item: { id: ref.id, ...payload } });
      return;
    }

    if (req.method === 'PUT') {
      const id = (typeof body.id === 'string' ? body.id : queryParam(req.query.id)).trim();
      if (!id) {
        throw new HttpError(400, 'Item id is required.');
      }

      const docRef = col.doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new HttpError(404, `${kind === 'advisory' ? 'Advisory' : 'System rule'} not found.`);
      }

      const updates: Record<string, unknown> = { updatedAt: nowIso };
      if (kind === 'advisory') {
        if (body.title !== undefined) {
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          if (!title || title.length > 120) {
            throw new HttpError(400, 'Advisory title must be between 1 and 120 characters.');
          }
          updates.title = title;
        }
        if (body.message !== undefined) {
          const message = typeof body.message === 'string' ? body.message.trim() : '';
          if (!message || message.length > 500) {
            throw new HttpError(400, 'Advisory message must be between 1 and 500 characters.');
          }
          updates.message = message;
        }
        if (body.severity !== undefined) {
          if (body.severity !== 'info' && body.severity !== 'warning' && body.severity !== 'critical') {
            throw new HttpError(400, 'severity must be "info", "warning", or "critical".');
          }
          updates.severity = body.severity;
        }
        if (body.active !== undefined) {
          if (typeof body.active !== 'boolean') {
            throw new HttpError(400, 'active must be a boolean.');
          }
          updates.active = body.active;
        }
        if (body.cityId !== undefined) {
          updates.cityId = typeof body.cityId === 'string' && body.cityId.trim() ? body.cityId.trim() : null;
        }
      } else {
        if (body.cityId !== undefined) {
          const cityId = typeof body.cityId === 'string' ? body.cityId.trim() : '';
          if (!cityId) throw new HttpError(400, 'cityId cannot be empty.');
          updates.cityId = cityId;
        }
        if (body.cityName !== undefined) {
          updates.cityName = typeof body.cityName === 'string' ? body.cityName.trim() : '';
        }
        if (body.aqiThreshold !== undefined) {
          const threshold = Number(body.aqiThreshold);
          if (!Number.isFinite(threshold) || threshold < 1 || threshold > 500) {
            throw new HttpError(400, 'aqiThreshold must be between 1 and 500.');
          }
          updates.aqiThreshold = Math.round(threshold);
        }
        if (body.enabled !== undefined) {
          if (typeof body.enabled !== 'boolean') {
            throw new HttpError(400, 'enabled must be a boolean.');
          }
          updates.enabled = body.enabled;
        }
        if (body.emailNotify !== undefined) {
          if (typeof body.emailNotify !== 'boolean') {
            throw new HttpError(400, 'emailNotify must be a boolean.');
          }
          updates.emailNotify = body.emailNotify;
        }
        if (body.description !== undefined) {
          updates.description = typeof body.description === 'string' ? body.description.trim() : '';
        }
      }

      await docRef.set(updates, { merge: true });
      const updatedSnap = await docRef.get();
      res.status(200).json({ kind, item: { id: updatedSnap.id, ...updatedSnap.data() } });
      return;
    }

    const id = (queryParam(req.query.id) || (typeof body.id === 'string' ? body.id : '')).trim();
    if (!id) {
      throw new HttpError(400, 'Item id is required.');
    }

    const docRef = col.doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      throw new HttpError(404, `${kind === 'advisory' ? 'Advisory' : 'System rule'} not found.`);
    }

    await docRef.delete();
    res.status(200).json({ deleted: true, id, kind });
  } catch (err) {
    sendError(res, err);
  }
}
