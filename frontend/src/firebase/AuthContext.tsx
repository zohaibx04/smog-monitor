import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
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

function mapAuthError(err: unknown, fallback: string): string {
  const code = (err as { code?: string })?.code
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email address or password'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters'
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not enabled for this project'
    case 'auth/invalid-email':
      return 'Enter a valid email address'
    case 'auth/user-disabled':
      return 'This account has been disabled by an administrator'
    case 'auth/too-many-requests':
      return 'Too many attempts — wait a moment and try again'
    default:
      return err instanceof Error ? err.message : fallback
  }
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  isAdmin: boolean
  loading: boolean
  authError: string | null
  isFirebaseConfigured: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<void>
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
    rememberMe: boolean,
  ) => Promise<void>
  resetPassword: (email: string) => Promise<void>
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
      setAuthError(mapAuthError(err, 'Google sign-in failed'))
    }
  }, [])

  const signInWithEmail = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      if (!auth) {
        const msg = 'Firebase authentication is not configured'
        setAuthError(msg)
        throw new Error(msg)
      }
      setAuthError(null)
      try {
        await setPersistence(
          auth,
          rememberMe ? browserLocalPersistence : browserSessionPersistence,
        )
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } catch (err: unknown) {
        const msg = mapAuthError(err, 'Email sign-in failed')
        setAuthError(msg)
        throw new Error(msg)
      }
    },
    [],
  )

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string, rememberMe: boolean) => {
      if (!auth) {
        const msg = 'Firebase authentication is not configured'
        setAuthError(msg)
        throw new Error(msg)
      }
      setAuthError(null)
      try {
        await setPersistence(
          auth,
          rememberMe ? browserLocalPersistence : browserSessionPersistence,
        )
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        const trimmedName = name.trim()
        if (trimmedName) {
          await updateProfile(cred.user, { displayName: trimmedName })
          setProfile((prev) => (prev ? { ...prev, displayName: trimmedName } : prev))
        }
      } catch (err: unknown) {
        const msg = mapAuthError(err, 'Account creation failed')
        setAuthError(msg)
        throw new Error(msg)
      }
    },
    [],
  )

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) {
      const msg = 'Firebase authentication is not configured'
      setAuthError(msg)
      throw new Error(msg)
    }
    const trimmed = email.trim()
    if (!trimmed) {
      const msg = 'Enter your email address first'
      setAuthError(msg)
      throw new Error(msg)
    }
    setAuthError(null)
    try {
      await sendPasswordResetEmail(auth, trimmed)
    } catch (err: unknown) {
      const msg = mapAuthError(err, 'Unable to send password reset email')
      setAuthError(msg)
      throw new Error(msg)
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
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
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
