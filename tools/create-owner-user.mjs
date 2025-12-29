/*
  Create (or update) an Owner user in Firebase Auth AND link them to a restaurant.

  Writes:
    owners/{uid} -> { restaurantId: "ajwa", email: "..." }

  Requires Node 18+, firebase-admin, and a service account:

    npm init -y
    npm i firebase-admin

  PowerShell example:
    $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccount.json"
    node tools/create-owner-user.mjs --email owner@ajwa.com --password "DineQR123!" --restaurantId ajwa

  Output:
    Prints the uid + the credentials you passed in.
*/

import process from "node:process";
import admin from "firebase-admin";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function requireStr(args, key) {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Missing --${key}`);
  }
  return v.trim();
}

function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

async function upsertUser(email, password) {
  try {
    const existing = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(existing.uid, { password });
    return existing.uid;
  } catch (e) {
    // If not found, create.
    if (String(e?.code || "") !== "auth/user-not-found") throw e;
    const created = await admin.auth().createUser({ email, password });
    return created.uid;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const email = requireStr(args, "email");
  const password = requireStr(args, "password");
  const restaurantId = requireStr(args, "restaurantId");

  initAdmin();

  const uid = await upsertUser(email, password);

  await admin.firestore().doc(`owners/${uid}`).set(
    {
      email,
      restaurantId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Owner ready:");
  console.log(`  uid: ${uid}`);
  console.log(`  email: ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  restaurantId: ${restaurantId}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
