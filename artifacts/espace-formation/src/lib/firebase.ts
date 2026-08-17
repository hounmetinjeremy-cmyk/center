import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC62ADYoetwyQISP9w4P9E7Izc7gZ2AXZc",
  authDomain: "forma-198b8.firebaseapp.com",
  projectId: "forma-198b8",
  storageBucket: "forma-198b8.firebasestorage.app",
  messagingSenderId: "1009313942023",
  appId: "1:1009313942023:web:0f9aefa603ad4c874478a2",
  measurementId: "G-7FWP987G8X",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
