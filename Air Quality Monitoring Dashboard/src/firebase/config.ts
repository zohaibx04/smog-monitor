import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined

export const isFirebaseConfigured = Boolean(apiKey && projectId)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let googleProvider: GoogleAuthProvider | null = null

if (isFirebaseConfigured) {
  const config = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  }
  app = getApps().length ? getApps()[0] : initializeApp(config)
  auth = getAuth(app)
  db = getFirestore(app)
  googleProvider = new GoogleAuthProvider()
  googleProvider.setCustomParameters({ prompt: 'select_account' })
}

export { app, auth, db, googleProvider }
