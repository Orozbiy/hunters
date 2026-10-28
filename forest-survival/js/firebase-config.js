// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBAOe3KmSoav3qHoaGqtvyEAkQsVcFjoSY",
  authDomain: "hunter-d1e3f.firebaseapp.com",
  projectId: "hunter-d1e3f",
  storageBucket: "hunter-d1e3f.firebasestorage.app",
  messagingSenderId: "770632398639",
  appId: "1:770632398639:web:f1e4c093387c5e22d3d3da",
  measurementId: "G-0PRJ0PD5H2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);