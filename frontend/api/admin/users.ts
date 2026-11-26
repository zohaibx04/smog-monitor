import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertMethod,
  getAdminAuth,
  getAdminDb,
  HttpError,
  parseJsonBody,
  requireAdmin,
  sendError,
  type UserRole,
} from '../_lib/firebaseAdmin';

interface PatchUserBody {
  uid?: unknown;
  role?: unknown;
  disabled?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertMethod(req, res, ['GET', 'PATCH'])) return;

  try {
    const admin = await requireAdmin(req);
    const db = getAdminDb();
    const auth = getAdminAuth();

    if (req.method === 'GET') {
      const snap = await db.collection('users').orderBy('lastSeenAt', 'desc').get();
      const users = snap.docs.map((doc) => ({
        uid: doc.id,
        ...doc.data(),
      }));
      res.status(200).json({ users });
      return;
    }

    const body = parseJsonBody<PatchUserBody>(req);
    const targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!targetUid) {
      throw new HttpError(400, 'Target user uid is required.');
    }

    const hasRole = body.role !== undefined;
    const hasDisabled = body.disabled !== undefined;
    if (!hasRole && !hasDisabled) {
      throw new HttpError(400, 'Provide role or disabled to update.');
    }

    const userRef = db.collection('users').doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpError(404, 'User not found.');
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (hasRole) {
      if (body.role !== 'admin' && body.role !== 'user') {
        throw new HttpError(400, 'Role must be "admin" or "user".');
      }
      const nextRole: UserRole = body.role;
      if (targetUid === admin.uid && nextRole !== 'admin') {
        throw new HttpError(400, 'You cannot demote your own admin account.');
      }

      const authRecord = await auth.getUser(targetUid);
      await auth.setCustomUserClaims(targetUid, {
        ...(authRecord.customClaims ?? {}),
        role: nextRole,
      });
      updates.role = nextRole;
    }

    if (hasDisabled) {
      if (typeof body.disabled !== 'boolean') {
        throw new HttpError(400, 'disabled must be a boolean.');
      }
      if (targetUid === admin.uid && body.disabled) {
        throw new HttpError(400, 'You cannot disable your own account.');
      }

      await auth.updateUser(targetUid, { disabled: body.disabled });
      updates.disabled = body.disabled;
    }

    await userRef.set(updates, { merge: true });
    const updatedSnap = await userRef.get();

    res.status(200).json({
      user: {
        uid: updatedSnap.id,
        ...updatedSnap.data(),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
}
