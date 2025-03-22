
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; 

const firebaseConfig = {
  apiKey: "AIzaSyDgwc86-vVQ492yDQ5O-FkYhig7T8ApQRQ",
  authDomain: "servibid.firebaseapp.com",
  projectId: "servibid",
  storageBucket: "servibid.firebasestorage.app",
  messagingSenderId: "5657642585",
  appId: "1:5657642585:web:d8fccc0d2075c779005348",
  measurementId: "G-E0KY8V1Z7Q"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);      // Firestore for messages
export const auth = getAuth(app);          // Authentication (needed even with Clerk)
export const firebaseApp = app;       


