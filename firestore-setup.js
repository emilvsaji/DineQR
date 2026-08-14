// FIRESTORE SETUP SCRIPT
// Copy and paste this into browser console at: http://localhost:8000/owner/dashboard.html (after login)

import {
  getFirestore,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "../js/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function setupData() {
  const user = auth.currentUser;
  if (!user) {
    console.log("❌ Please login first!");
    return;
  }

  console.log("👤 Current user UID:", user.uid);

  try {
    // 1. Create restaurant
    console.log("🏪 Creating restaurant...");
    await setDoc(doc(db, "restaurants", "ajwa"), {
      id: "ajwa",
      name: "Ajwa Kitchen",
      tagline: "Authentic Arabian • Fresh • Quality",
      address: "Erattupetta, Kerala, India",
      phone: "+91 9876 543210",
      openHours: "Daily 11:00 - 23:00",
      currency: "INR",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("✅ Restaurant created");

    // 2. Create owner document
    console.log("👨‍💼 Creating owner document...");
    await setDoc(doc(db, "owners", user.uid), {
      uid: user.uid,
      restaurantId: "ajwa",
      role: "owner",
      email: user.email,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("✅ Owner document created");

    console.log("🎉 Setup complete! Your dashboard should now work.");
    alert("✅ Setup complete! Refresh the page to load your data.");

  } catch (error) {
    console.error("❌ Setup failed:", error);
  }
}

setupData();