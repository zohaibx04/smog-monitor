import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import type { HealthProfile } from '../api'
import { auth, db, googleProvider, isFirebaseConfigured } from './config'

export interface UserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  role: 'user' | 'admin'
  disabled?: boolean
  defaultCityId?: string | null
  theme?: 'dark' | 'light'
  emailAlertsEnabled?: boolean
  healthProfile: HealthProfile
  createdAt?: string
  lastSeenAt?: string
}

export interface ProfilePrefsPatch {
  defaultCityId?: string | null
  theme?: 'dark' | 'light'
  emailAlertsEnabled?: boolean
  healthProfile?: HealthProfile
}

function normalizeHealthProfile(value: unknown): HealthProfile {
  if (value === 'respiratory' || value === 'sensitive' || value === 'athlete') {
    return value
  }
  return 'general'
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  isAdmin: boolean
  loading: boolean
  authError: string | null
  isFirebaseConfigured: boolean
  signInWithGoogle: () => Promise<void>
  signOutUser: () => Promise<void>
  getIdToken: () => Promise<string | null>
  updateProfilePrefs: (prefs: ProfilePrefsPatch) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null)
        setProfile(null)
        setIsAdmin(false)
        setLoading(false)
        return
      }

      setUser(nextUser)
      setAuthError(null)
      setLoading(true)

      try {
        let token = await nextUser.getIdToken()
        let bootstrapRole: 'user' | 'admin' = 'user'
        let bootstrapProfile: Partial<UserProfile> | undefined

        const res = await fetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })

        if (res.status === 403) {
          const detail = await res.json().catch(() => null)
          throw new Error(detail?.message || 'This account has been disabled by an administrator')
        }

        if (res.ok) {
          const data = (await res.json()) as {
            profile?: Partial<UserProfile>
            role?: 'user' | 'admin'
            claimsUpdated?: boolean
          }
          bootstrapProfile = data.profile
          if (data.role === 'admin') bootstrapRole = 'admin'
          if (data.claimsUpdated) {
            token = await nextUser.getIdToken(true)
          }
        }

        const tokenResult = await nextUser.getIdTokenResult()
        const claimAdmin = tokenResult.claims?.role === 'admin'

        let firestoreProfile: (Partial<UserProfile> & { name?: string | null; picture?: string | null }) | undefined
        if (db) {
          const snap = await getDoc(doc(db, 'users', nextUser.uid)).catch(() => null)
          if (snap?.exists()) {
            firestoreProfile = snap.data() as Partial<UserProfile> & { name?: string | null; picture?: string | null }
          }
        }

        const bootstrapRaw = bootstrapProfile as (Partial<UserProfile> & { name?: string | null; picture?: string | null }) | undefined
        const resolvedRole: 'user' | 'admin' =
          claimAdmin || firestoreProfile?.role === 'admin' || bootstrapRole === 'admin'
            ? 'admin'
            : 'user'

        const mergedProfile: UserProfile = {
          uid: nextUser.uid,
          email: firestoreProfile?.email ?? bootstrapRaw?.email ?? nextUser.email,
          displayName:
            firestoreProfile?.displayName ??
            firestoreProfile?.name ??
            bootstrapRaw?.displayName ??
            bootstrapRaw?.name ??
            nextUser.displayName,
          photoURL:
            firestoreProfile?.photoURL ??
            firestoreProfile?.picture ??
            bootstrapRaw?.photoURL ??
            bootstrapRaw?.picture ??
            nextUser.photoURL,
          role: resolvedRole,
          disabled: firestoreProfile?.disabled ?? bootstrapRaw?.disabled ?? false,
          defaultCityId:
            firestoreProfile?.defaultCityId ?? bootstrapRaw?.defaultCityId ?? null,
          theme: firestoreProfile?.theme ?? bootstrapRaw?.theme,
          emailAlertsEnabled:
            firestoreProfile?.emailAlertsEnabled ?? bootstrapRaw?.emailAlertsEnabled ?? true,
          healthProfile: normalizeHealthProfile(
            firestoreProfile?.healthProfile ?? bootstrapRaw?.healthProfile,
          ),
          createdAt: firestoreProfile?.createdAt ?? bootstrapRaw?.createdAt,
          lastSeenAt: firestoreProfile?.lastSeenAt ?? bootstrapRaw?.lastSeenAt,
        }

        setProfile(mergedProfile)
        setIsAdmin(resolvedRole === 'admin')
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to initialize your account session'
        setAuthError(message)
        if (message.toLowerCase().includes('disabled') && auth) {
          await signOut(auth).catch(() => undefined)
          setUser(null)
          setProfile(null)
          setIsAdmin(false)
        }
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      setAuthError('Firebase authentication is not configured')
      return
    }
    setAuthError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return
      }
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed')
    }
  }, [])

  const signOutUser = useCallback(async () => {
    if (!auth) return
    setAuthError(null)
    await signOut(auth)
    setUser(null)
    setProfile(null)
    setIsAdmin(false)
  }, [])

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth?.currentUser) return null
    return auth.currentUser.getIdToken()
  }, [])

  const updateProfilePrefs = useCallback(
    async (prefs: ProfilePrefsPatch) => {
      if (!user || !db) return
      const next: ProfilePrefsPatch = {}
      if (prefs.defaultCityId !== undefined) next.defaultCityId = prefs.defaultCityId
      if (prefs.theme !== undefined) next.theme = prefs.theme
      if (prefs.emailAlertsEnabled !== undefined) next.emailAlertsEnabled = prefs.emailAlertsEnabled
      if (prefs.healthProfile !== undefined) next.healthProfile = prefs.healthProfile

      if (Object.keys(next).length === 0) return

      await updateDoc(doc(db, 'users', user.uid), { ...next })
      setProfile((prev) => (prev ? { ...prev, ...next } : prev))
    },
    [user],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        loading,
        authError,
        isFirebaseConfigured,
        signInWithGoogle,
        signOutUser,
        getIdToken,
        updateProfilePrefs,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
