// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCWjnJMgmAs0P8F4ALePNuFI1mggA4snzw",
    authDomain: "freezesense-dabf4.firebaseapp.com",
    projectId: "freezesense-dabf4",
    storageBucket: "freezesense-dabf4.firebasestorage.app",
    messagingSenderId: "469823188022",
    appId: "1:469823188022:web:cf138079822a6f27077c97",
    measurementId: "G-KV503DP24W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);

export { auth }; 