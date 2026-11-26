import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  assertMethod,
  extractBearerToken,
  getAdminAuth,
  getAdminDb,
  HttpError,
  sendError,
  type UserRole,
} from '../_lib/firebaseAdmin';

function getConfiguredAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['POST'])) return;

  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new HttpError(401, 'Missing or invalid Authorization Bearer token.');
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch (err: unknown) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
      if (code === 'auth/user-disabled') {
        throw new HttpError(403, 'This account has been disabled.');
      }
      throw new HttpError(401, 'Invalid or expired Firebase ID token.');
    }

    const uid = decoded.uid;
    const authUser = await adminAuth.getUser(uid);
    if (authUser.disabled) {
      throw new HttpError(403, 'This account has been disabled.');
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const existingData = userSnap.exists ? userSnap.data() : undefined;

    if (existingData?.disabled === true) {
      throw new HttpError(403, 'This account has been disabled.');
    }

    const email = String(decoded.email ?? authUser.email ?? existingData?.email ?? '').trim();
    const name = String(decoded.name ?? authUser.displayName ?? existingData?.name ?? email.split('@')[0] ?? 'User').trim();
    const picture = String(decoded.picture ?? authUser.photoURL ?? existingData?.picture ?? '').trim();

    const adminEmails = getConfiguredAdminEmails();
    const isListedAdmin = Boolean(email && adminEmails.has(email.toLowerCase()));
    const existingClaimRole = authUser.customClaims?.role;
    const isAlreadyAdmin =
      existingClaimRole === 'admin' ||
      decoded.role === 'admin' ||
      existingData?.role === 'admin';

    const role: UserRole = isListedAdmin || isAlreadyAdmin ? 'admin' : 'user';

    let claimsUpdated = false;
    if (existingClaimRole !== role) {
      await adminAuth.setCustomUserClaims(uid, {
        ...(authUser.customClaims ?? {}),
        role,
      });
      claimsUpdated = true;
    }

    const nowIso = new Date().toISOString();
    const watchlistSnap = await userRef.collection('watchlist').limit(1).get();
    const shouldSeedStarters =
      (!userSnap.exists || existingData?.starterSeeded !== true) && watchlistSnap.empty;

    let defaultCityId: string | null =
      typeof existingData?.defaultCityId === 'string' && existingData.defaultCityId
        ? existingData.defaultCityId
        : null;

    if (shouldSeedStarters) {
      const startersSnap = await adminDb
        .collection('globalCities')
        .where('isStarter', '==', true)
        .get();

      if (!startersSnap.empty) {
        const sortedStarters = [...startersSnap.docs].sort((a, b) => {
          const nameA = String(a.data().name ?? '');
          const nameB = String(b.data().name ?? '');
          if (nameA.toLowerCase().startsWith('islamabad')) return -1;
          if (nameB.toLowerCase().startsWith('islamabad')) return 1;
          return nameA.localeCompare(nameB);
        });

        const batch = adminDb.batch();
        for (const cityDoc of sortedStarters) {
          const cityData = cityDoc.data();
          batch.set(userRef.collection('watchlist').doc(cityDoc.id), {
            cityId: cityDoc.id,
            name: String(cityData.name ?? ''),
            latitude: Number(cityData.latitude ?? 0),
            longitude: Number(cityData.longitude ?? 0),
            addedAt: nowIso,
          });
          batch.update(cityDoc.ref, {
            watchlistCount: FieldValue.increment(1),
          });
        }
        await batch.commit();

        if (!defaultCityId) {
          defaultCityId = sortedStarters[0].id;
        }
      }
    }

    const profilePayload = {
      uid,
      email,
      name,
      picture,
      role,
      disabled: false,
      defaultCityId,
      theme: existingData?.theme === 'light' ? 'light' : 'dark',
      emailAlertsEnabled: existingData?.emailAlertsEnabled !== false,
      starterSeeded: existingData?.starterSeeded === true || shouldSeedStarters,
      createdAt: typeof existingData?.createdAt === 'string' ? existingData.createdAt : nowIso,
      lastSeenAt: nowIso,
    };

    await userRef.set(profilePayload, { merge: true });

    res.status(200).json({
      profile: profilePayload,
      role,
      claimsUpdated,
    });
  } catch (err) {
    sendError(res, err);
  }
}
