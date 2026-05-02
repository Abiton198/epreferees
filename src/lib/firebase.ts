import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
    getFirestore,
    doc,
    setDoc,
    arrayUnion,
    serverTimestamp
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

// 🔔 Firebase Cloud Messaging
import {
    getMessaging,
    getToken,
    onMessage
} from "firebase/messaging";


// ────────────────────────────────────────────────
// Firebase configuration (loaded from .env)
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


// 🔐 Core Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);


// 🔔 Messaging (Push Notifications)
export const messaging = getMessaging(app);


// ────────────────────────────────────────────────
// Request Push Permission + Save Token
// Call this after login
// ────────────────────────────────────────────────
export async function requestPushPermissionAndSaveToken(userId: string) {
    try {

        const permission = await Notification.requestPermission();

        if (permission !== "granted") {
            console.log("❌ Notification permission denied");
            return null;
        }

        // Get the FCM token
        const token = await getToken(messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_WEB_PUSH_CERTIFICATE_KEY
        });

        if (token) {

            console.log("✅ FCM Token:", token);

            // Save token to Firestore
            await setDoc(
                doc(db, "users", userId),
                {
                    fcmTokens: arrayUnion(token),
                    lastTokenRefresh: serverTimestamp(),
                },
                { merge: true }
            );

            return token;

        } else {
            console.warn("No registration token available");
        }

    } catch (err) {
        console.error("🔥 Error getting FCM token:", err);
    }

    return null;
}


// ────────────────────────────────────────────────
// Foreground push messages
// (When app is open)
// ────────────────────────────────────────────────
onMessage(messaging, (payload) => {

    console.log("📩 Foreground push received:", payload);

    // Example toast notification
    // You can integrate with Sonner / React Hot Toast

    /*
    toast.success(payload.notification?.title || "Notification", {
      description: payload.notification?.body,
    });
    */

});


// ────────────────────────────────────────────────
// Firebase Analytics (optional)
// ────────────────────────────────────────────────
export let analytics: any = null;

isSupported().then((supported) => {
    if (supported) {
        analytics = getAnalytics(app);
    }
});


// Export default Firebase app
export default app;