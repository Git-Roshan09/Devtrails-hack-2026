import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration for GigaChad project
// Note: For production, use expo-constants with app.config.js and EAS secrets
const firebaseConfig = {
  apiKey: "AIzaSyAhfQWcAGi4XaEk-t1So1xZ7h6M0GUmW8E",
  authDomain: "buildathon-376dc.firebaseapp.com",
  projectId: "buildathon-376dc",
  storageBucket: "buildathon-376dc.firebasestorage.app",
  messagingSenderId: "37358682868",
  appId: "1:37358682868:web:11b40e3a81e22fcac794a1"
};

const app = initializeApp(firebaseConfig);

// Keep user logged in across app restarts
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
