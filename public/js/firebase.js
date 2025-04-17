import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Firebase configuration
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
const db = getFirestore(app);

// Export the instances for other modules to use
export { auth, db }; 