import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Replace with actual config
const firebaseConfig = {
  apiKey: "SET_ME",
  authDomain: "SET_ME",
  projectId: "SET_ME",
  storageBucket: "SET_ME",
  messagingSenderId: "SET_ME",
  appId: "SET_ME"
};

const app = initializeApp(firebaseConfig);

// Keep user logged in across app restarts
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
