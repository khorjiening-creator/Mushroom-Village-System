import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyC73VF873Z7jgRDb1SXZqInMKjkR9kluVE",
  authDomain: "mushroom-village-system-1ce0d.firebaseapp.com",
  projectId: "mushroom-village-system-1ce0d",
  storageBucket: "mushroom-village-system-1ce0d.firebasestorage.app",
  messagingSenderId: "627870660202",
  appId: "1:627870660202:web:fd9d1cb54c612d9faf7c13",
  measurementId: "G-Z7MZ070LL9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);