// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDc9lNZkR3EFnqAXhBpbgGvQKvPVBGEPyQ",
    authDomain: "freezesense-dabf4.firebaseapp.com",
    projectId: "freezesense-dabf4",
    storageBucket: "freezesense-dabf4.appspot.com",
    messagingSenderId: "4698232188022",
    appId: "1:4698232188022:web:cf138079822a6f27077c97",
    measurementId: "G-KV503DP24W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth }; 