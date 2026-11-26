import { cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { AirQualityReading } from './openMeteo.js';

export type UserRole = 'admin' | 'user';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  name: string;
  picture: string;
  role: UserRole;
}

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function parseServiceAccount(): ServiceAccount {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const jsonText = rawJson.startsWith('{')
      ? rawJson
      : Buffer.from(rawJson, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const projectId = String(parsed.project_id ?? parsed.projectId ?? '');
    const clientEmail = String(parsed.client_email ?? parsed.clientEmail ?? '');
    const privateKey = String(parsed.private_key ?? parsed.privateKey ?? '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email, or private_key.');
    }

    return { projectId, clientEmail, privateKey };
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
    );
  }

  return { projectId, clientEmail, privateKey };
}

function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp({
    credential: cert(parseServiceAccount()),
  });
}

let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

export function getAdminAuth(): Auth {
  if (!cachedAuth) {
    cachedAuth = getAuth(getFirebaseAdminApp());
  }
  return cachedAuth;
}

export function getAdminDb(): Firestore {
  if (!cachedDb) {
    cachedDb = getFirestore(getFirebaseAdminApp());
  }
  return cachedDb;
}

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const instance = getAdminAuth();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const instance = getAdminDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export function extractBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization ?? req.headers.Authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function verifyAuth(req: VercelRequest): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new HttpError(401, 'Missing or invalid Authorization Bearer token.');
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === 'auth/user-disabled') {
      throw new HttpError(403, 'This account has been disabled.');
    }
    throw new HttpError(401, 'Invalid or expired Firebase ID token.');
  }

  const userDoc = await getAdminDb().collection('users').doc(decoded.uid).get();
  const userData = userDoc.exists ? userDoc.data() : undefined;

  if (userData?.disabled === true) {
    throw new HttpError(403, 'This account has been disabled.');
  }

  const role: UserRole =
    decoded.role === 'admin' || userData?.role === 'admin' ? 'admin' : 'user';

  return {
    uid: decoded.uid,
    email: String(decoded.email ?? userData?.email ?? ''),
    name: String(decoded.name ?? userData?.name ?? ''),
    picture: String(decoded.picture ?? userData?.picture ?? ''),
    role,
  };
}

export async function requireAdmin(req: VercelRequest): Promise<AuthenticatedUser> {
  const user = await verifyAuth(req);
  if (user.role !== 'admin') {
    throw new HttpError(403, 'Admin privileges are required.');
  }
  return user;
}

export function sendError(res: VercelResponse, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error.';
  console.error('[API Error]', err);
  res.status(500).json({ message });
}

export function assertMethod(req: VercelRequest, res: VercelResponse, allowed: string[]): boolean {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    res.setHeader('Allow', [...allowed, 'OPTIONS'].join(', '));
    res.status(204).end();
    return false;
  }
  if (!allowed.includes(method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ message: `Method ${method} not allowed.` });
    return false;
  }
  return true;
}

export function parseJsonBody<T = Record<string, unknown>>(req: VercelRequest): T {
  if (req.body == null) return {} as T;
  if (typeof req.body === 'string') {
    return (req.body.trim() ? JSON.parse(req.body) : {}) as T;
  }
  return req.body as T;
}

export function normalizeCityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isReadingStale(timestampIso: string | null | undefined, maxAgeHours = 3): boolean {
  if (!timestampIso) return true;
  const ms = Date.parse(timestampIso);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms > maxAgeHours * 3_600_000;
}

export async function saveCityReadings(
  cityId: string,
  readings: AirQualityReading[],
  minExclusiveTimestamp?: string | null,
): Promise<number> {
  const db = getAdminDb();
  const minMs = minExclusiveTimestamp ? Date.parse(minExclusiveTimestamp) : NaN;
  const toWrite = Number.isFinite(minMs)
    ? readings.filter((r) => Date.parse(r.timestamp) > minMs)
    : readings;

  if (toWrite.length === 0) return 0;

  const readingsCol = db.collection('globalCities').doc(cityId).collection('readings');
  const chunkSize = 400;
  for (let i = 0; i < toWrite.length; i += chunkSize) {
    const chunk = toWrite.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const reading of chunk) {
      const docId = reading.timestamp.replace(/[:.]/g, '-');
      batch.set(readingsCol.doc(docId), reading, { merge: true });
    }
    await batch.commit();
  }

  return toWrite.length;
}
