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
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore(); 