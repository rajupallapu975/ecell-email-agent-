const { initializeApp, cert, getApps } = require('firebase-admin/app');
let getFirestore = null;
try {
  getFirestore = require('firebase-admin/firestore').getFirestore;
} catch (e) {
  console.warn('⚠️ @google-cloud/firestore not installed, fallback to local database mode.');
}
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'firebase_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Local datastore for fallback or standalone mode
function initLocalDb() {
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initialDb = {
      connected_accounts: [],
      in_app_recipients: [
        { email: 'innovate@ecell.org', name: 'E-Cell Innovation Desk', organization: 'E-Cell Central', category: 'internal' },
        { email: 'delegates@ecell-summit.com', name: 'Summit Delegate Pool', organization: 'E-Summit', category: 'summit' },
        { email: 'founders@startuparena.in', name: 'Startup Arena Network', organization: 'Startup Arena', category: 'network' }
      ],
      campaigns: []
    };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  }
}

initLocalDb();

function readLocalDb() {
  initLocalDb();
  try {
    return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf-8'));
  } catch (e) {
    return { connected_accounts: [], in_app_recipients: [], campaigns: [] };
  }
}

function writeLocalDb(data) {
  initLocalDb();
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Firebase Admin Initialization (Checks for service account credentials or environment variables)
let firestore = null;
let isFirebaseActive = false;

function initFirebase() {
  if (firestore) return firestore;

  let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  } else if (!path.isAbsolute(serviceAccountPath)) {
    serviceAccountPath = path.join(__dirname, '..', serviceAccountPath);
  }
  
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
      const apps = getApps();
      if (!apps || !apps.length) {
        initializeApp({
          credential: cert(serviceAccount)
        });
      }
      if (typeof getFirestore === 'function') {
        firestore = getFirestore();
        isFirebaseActive = true;
        console.log('🔥 Firebase Admin initialized successfully with serviceAccountKey!');
        return firestore;
      } else {
        console.log('📁 Firestore client library not present, using local database mode.');
      }
    } catch (err) {
      console.warn('⚠️ Firebase init failed from serviceAccount file, using local database mode:', err.message);
    }
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      const apps = getApps();
      if (!apps || !apps.length) {
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          })
        });
      }
      firestore = getFirestore();
      isFirebaseActive = true;
      console.log('🔥 Firebase Admin initialized successfully with environment credentials!');
      return firestore;
    } catch (err) {
      console.warn('⚠️ Firebase init failed from env credentials, using local database mode:', err.message);
    }
  }

  console.log('📁 Using local database for tokens and accounts (Firebase fallback mode).');
  return null;
}

// ==========================================
// CONNECTED GMAIL ACCOUNTS
// ==========================================

async function saveConnectedAccount(accountData) {
  const db = initFirebase();
  const accountId = accountData.id || accountData.email.replace(/[^a-zA-Z0-9_]/g, '_');
  const record = {
    ...accountData,
    id: accountId,
    updatedAt: new Date().toISOString()
  };

  if (db && isFirebaseActive) {
    try {
      await db.collection('connected_accounts').doc(accountId).set(record, { merge: true });
      return record;
    } catch (e) {
      console.error('Firebase save account error, falling back to local DB:', e.message);
    }
  }

  // Local fallback
  const local = readLocalDb();
  const idx = local.connected_accounts.findIndex(a => a.id === accountId || a.email === record.email);
  if (idx >= 0) {
    local.connected_accounts[idx] = { ...local.connected_accounts[idx], ...record };
  } else {
    local.connected_accounts.push(record);
  }
  writeLocalDb(local);
  return record;
}

async function getConnectedAccounts() {
  const db = initFirebase();
  if (db && isFirebaseActive) {
    try {
      const snapshot = await db.collection('connected_accounts').get();
      const accounts = [];
      snapshot.forEach(doc => accounts.push(doc.data()));
      return accounts;
    } catch (e) {
      console.error('Firebase get accounts error, falling back to local DB:', e.message);
    }
  }

  const local = readLocalDb();
  return local.connected_accounts || [];
}

async function getConnectedAccountById(id) {
  const db = initFirebase();
  if (db && isFirebaseActive) {
    try {
      const doc = await db.collection('connected_accounts').doc(id).get();
      if (doc.exists) return doc.data();
    } catch (e) {
      console.error('Firebase get account by id error, falling back to local DB:', e.message);
    }
  }

  const local = readLocalDb();
  return local.connected_accounts.find(a => a.id === id || a.email === id) || null;
}

async function updateAccountTokens(id, tokens) {
  const db = initFirebase();
  if (db && isFirebaseActive) {
    try {
      await db.collection('connected_accounts').doc(id).update({
        tokens,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (e) {
      console.error('Firebase update tokens error:', e.message);
    }
  }

  const local = readLocalDb();
  const account = local.connected_accounts.find(a => a.id === id || a.email === id);
  if (account) {
    account.tokens = { ...account.tokens, ...tokens };
    account.updatedAt = new Date().toISOString();
    writeLocalDb(local);
    return true;
  }
  return false;
}

async function deleteConnectedAccount(id) {
  const db = initFirebase();
  if (db && isFirebaseActive) {
    try {
      await db.collection('connected_accounts').doc(id).delete();
      return true;
    } catch (e) {
      console.error('Firebase delete account error:', e.message);
    }
  }

  const local = readLocalDb();
  local.connected_accounts = local.connected_accounts.filter(a => a.id !== id && a.email !== id);
  writeLocalDb(local);
  return true;
}

// ==========================================
// IN-APP & ASSOCIATED RECIPIENTS
// ==========================================

async function getInAppRecipients() {
  const db = initFirebase();
  if (db && isFirebaseActive) {
    try {
      const snapshot = await db.collection('recipients').get();
      const list = [];
      snapshot.forEach(doc => list.push(doc.data()));
      if (list.length > 0) return list;
    } catch (e) {
      console.error('Firebase get recipients error:', e.message);
    }
  }

  const local = readLocalDb();
  return local.in_app_recipients || [];
}

async function saveInAppRecipients(recipientsList) {
  const db = initFirebase();
  if (db && isFirebaseActive) {
    try {
      const batch = db.batch();
      recipientsList.forEach(r => {
        const docRef = db.collection('recipients').doc(r.email.replace(/[^a-zA-Z0-9_]/g, '_'));
        batch.set(docRef, r, { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.error('Firebase save recipients batch error:', e.message);
    }
  }

  const local = readLocalDb();
  local.in_app_recipients = recipientsList;
  writeLocalDb(local);
  return true;
}

module.exports = {
  initFirebase,
  isFirebaseActive: () => isFirebaseActive,
  saveConnectedAccount,
  getConnectedAccounts,
  getConnectedAccountById,
  updateAccountTokens,
  deleteConnectedAccount,
  getInAppRecipients,
  saveInAppRecipients
};
