// src/lib/firebase.ts

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
    getFirestore,
    doc,
    setDoc,
    arrayUnion,
    serverTimestamp
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

// ────────────────────────────────────────────────
// Firebase configuration (from .env)
// ────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};


// ────────────────────────────────────────────────
// Initialize Firebase
// ────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);

// 🔐 Core services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ────────────────────────────────────────────────
// Analytics (safe init)
// ────────────────────────────────────────────────
export let analytics: any = null;

(async () => {
    try {
        if (await isSupported()) {
            analytics = getAnalytics(app);
        }
    } catch (err) {
        console.log("Analytics not supported");
    }
})();

export default app;