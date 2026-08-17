import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// TODO: remplace ces valeurs par la config de ton NOUVEAU projet Firebase.
// Firebase Console → Paramètres du projet (⚙️) → Vos applications → Config SDK
const firebaseConfig = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI.firebaseapp.com",
  projectId: "REMPLACE_MOI",
  storageBucket: "REMPLACE_MOI.firebasestorage.app",
  messagingSenderId: "REMPLACE_MOI",
  appId: "REMPLACE_MOI",
  measurementId: "REMPLACE_MOI",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
