import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD9uOZ7cli23FmnPH89gb6KewPcOFrZXMM",
  authDomain: "center-d25a2.firebaseapp.com",
  projectId: "center-d25a2",
  storageBucket: "center-d25a2.firebasestorage.app",
  messagingSenderId: "996031391100",
  appId: "1:996031391100:web:90bbe8eacc5d71588770f9",
  measurementId: "G-SNX4LWMZTC",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
