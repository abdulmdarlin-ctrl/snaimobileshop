
import { initializeApp, deleteApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyAANIGRyqiPDWE4Ff-xwYJN6TFBTnBaCiQ",
  authDomain: "snai-inventory-system.firebaseapp.com",
  projectId: "snai-inventory-system",
  storageBucket: "snai-inventory-system.firebasestorage.app",
  messagingSenderId: "1087198049272",
  appId: "1:1087198049272:web:a8ed8222618c16659c1c0d",
  measurementId: "G-ZDRXVYQ3NN"
};

let app;
let dbInstance;
let auth;

try {
  app = initializeApp(firebaseConfig);
  // Initialize Firestore
  dbInstance = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

// Utility to create a user in Firebase Auth without logging out the current user (Admin)
// This works by initializing a temporary, secondary Firebase App instance.
export const createSecondaryUser = async (email: string, password: string): Promise<string> => {
  let secondaryApp: FirebaseApp | null = null;
  try {
    const appName = `secondary-app-${Date.now()}`;
    secondaryApp = initializeApp(firebaseConfig, appName);
    const secondaryAuth = getAuth(secondaryApp);

    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    
    // We immediately sign out the secondary auth to clean up, though it doesn't affect the main app
    await signOut(secondaryAuth);
    
    return userCredential.user.uid;
  } catch (error) {
    console.error("Error creating secondary user:", error);
    throw error;
  } finally {
    if (secondaryApp) {
      await deleteApp(secondaryApp);
    }
  }
};

export { app, dbInstance, auth };
