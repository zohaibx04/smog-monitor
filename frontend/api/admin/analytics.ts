import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertMethod,
  getAdminDb,
  requireAdmin,
  sendError,
} from '../_lib/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET'])) return;

  try {
    await requireAdmin(req);
    const db = getAdminDb();

    const [usersSnap, citiesSnap, activeAlertsSnap, emailLogsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('globalCities').get(),
      db.collectionGroup('alerts').where('status', '==', 'Active').get(),
      db.collection('emailLogs').orderBy('createdAt', 'desc').limit(25).get(),
    ]);

    const totalUsers = usersSnap.size;
    const adminCount = usersSnap.docs.filter((doc) => doc.data().role === 'admin').length;

    const totalCities = citiesSnap.size;
    let activeCities = 0;
    let staleCities = 0;

    const citySummaries = citiesSnap.docs.map((doc) => {
      const data = doc.data();
      const isActive = data.active !== false;
      const isStale = data.stale === true || !data.latestReading;
      if (isActive) activeCities += 1;
      if (isActive && isStale) staleCities += 1;

      const latest = data.latestReading as { aqi?: number | null; timestamp?: string } | null | undefined;
      return {
        id: doc.id,
        name: String(data.name ?? doc.id),
        watchlistCount: Number(data.watchlistCount ?? 0),
        aqi: typeof latest?.aqi === 'number' ? latest.aqi : null,
        stale: isStale,
        active: isActive,
        isStarter: Boolean(data.isStarter),
        lastError: typeof data.lastError === 'string' ? data.lastError : null,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
      };
    });

    const topCities = [...citySummaries]
      .sort((a, b) => b.watchlistCount - a.watchlistCount || a.name.localeCompare(b.name))
      .slice(0, 10);

    const recentEmailLogs = emailLogsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      totalUsers,
      adminCount,
      totalCities,
      activeCities,
      staleCities,
      activeAlertsCount: activeAlertsSnap.size,
      topCities,
      recentEmailLogs,
    });
  } catch (err) {
    sendError(res, err);
  }
}
