// TaskUp - script.js
// Replace YOUR_BOT_USERNAME with your bot username (without @) in referralLinkTemplate below

// -------------------------
// Firebase initialization (compat)
// -------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDS-X4ZRHlLIBOZJsYKc9oGnNrL6k0J50U",
  authDomain: "taskup-47d9c.firebaseapp.com",
  projectId: "taskup-47d9c",
  storageBucket: "taskup-47d9c.appspot.com",
  messagingSenderId: "889706397464",
  appId: "1:889706397464:web:12e95e738f3f42ba08a86d",
  measurementId: "G-FDKNRDJXQS"
};
firebase.initializeApp(firebaseConfig);
// firebase.analytics(); // optional
const db = firebase.firestore();

// -------------------------
// Telegram WebApp init
// -------------------------
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) tg.ready();
const tgUser = tg?.initDataUnsafe?.user || null;

// -------------------------
// Helpers: get params, UI
// -------------------------
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}
const urlRef = getQueryParam('ref') || getQueryParam('start') || null;

// Bot username template (replace YOUR_BOT_USERNAME)
const referralLinkTemplate = (id) => `https://t.me/YOUR_BOT_USERNAME?start=${id}`;

// Determine user id (in Telegram WebApp use real id; outside use demo id)
const telegramUserId = tgUser ? String(tgUser.id) : ("demo_" + Math.floor(Math.random()*1000000));

// -------------------------
// Create user (if not exists) and credit referrer once
// -------------------------
async function ensureUserAndMaybeCredit() {
  const userRef = db.collection('users').doc(telegramUserId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    // create user doc with referrer stored if present
    await userRef.set({
      name: (tgUser?.first_name || 'User') + (tgUser?.last_name ? (' ' + tgUser.last_name) : ''),
      username: tgUser?.username ? ('@' + tgUser.username) : '',
      balance: 0,
      earnedSoFar: 0,
      adsViewed: 0,
      referrals: 0,
      referralEarnings: 0,
      referrer: urlRef || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // increment referrer counters (simple increment; to avoid double-counting in production use transaction/subcollection)
    if (urlRef && urlRef !== telegramUserId) {
      const refRef = db.collection('users').doc(String(urlRef));
      // check exists before updating
      const refSnap = await refRef.get();
      if (refSnap.exists) {
        await refRef.update({
          referrals: firebase.firestore.FieldValue.increment(1)
        });
      }
    }
  }
}

// -------------------------
// Real-time listener for current user
// -------------------------
function subscribeToUser() {
  const userRef = db.collection('users').doc(telegramUserId);
  userRef.onSnapshot((snap) => {
    if (!snap.exists) return;
    const data = snap.data();
    document.getElementById('profile-name').innerText = data.name || 'User';
    document.getElementById('telegram-username').innerText = data.username || '@username';
    document.getElementById('profile-balance').innerText = data.balance ?? 0;
    document.getElementById('earned-so-far').innerText = data.earnedSoFar ?? 0;
    document.getElementById('total-ads-viewed').innerText = data.adsViewed ?? 0;
    document.getElementById('total-refers').innerText = data.referrals ?? 0;
    document.getElementById('refer-count').innerText = data.referrals ?? 0;
    document.getElementById('refer-earnings').innerText = data.referralEarnings ?? 0;
    document.getElementById('referral-link').value = referralLinkTemplate(telegramUserId);
  }, (err) => {
    console.error('onSnapshot error', err);
  });
}

// -------------------------
// Earnings + referral bonus (10%)
// -------------------------
async function addEarnings(userId, amount) {
  const userRef = db.collection('users').doc(String(userId));
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;
  const data = userSnap.data();

  // update user earnings
  await userRef.update({
    balance: firebase.firestore.FieldValue.increment(amount),
    earnedSoFar: firebase.firestore.FieldValue.increment(amount)
  });

  // credit referrer 10%
  if (data.referrer) {
    const bonus = Math.round((amount * 0.10) * 100) / 100; // round to 2 decimals
    const refRef = db.collection('users').doc(String(data.referrer));
    const refSnap = await refRef.get();
    if (refSnap.exists) {
      await refRef.update({
        balance: firebase.firestore.FieldValue.increment(bonus),
        referralEarnings: firebase.firestore.FieldValue.increment(bonus)
      });
    }
  }
}

// -------------------------
// Test earn button
// -------------------------
function testEarn() {
  addEarnings(telegramUserId, 10).then(() => {
    alert('Added 10 PEPE (10% to referrer if any)');
  }).catch(err => {
    console.error(err);
    alert('Error adding earnings. See console.');
  });
}

// -------------------------
// Modal + UI helpers
// -------------------------
function openReferModal() {
  document.getElementById('refer-modal').style.display = 'flex';
  document.getElementById('refer-modal').setAttribute('aria-hidden','false');
}
function closeReferModal() {
  document.getElementById('refer-modal').style.display = 'none';
  document.getElementById('refer-modal').setAttribute('aria-hidden','true');
}
function copyReferralLink(btn) {
  const input = document.getElementById('referral-link');
  input.select();
  try {
    document.execCommand('copy');
    btn.innerText = 'Copied';
    setTimeout(()=> btn.innerHTML = '<i class="fas fa-copy"></i>', 1400);
  } catch (e) {
    alert('Copy failed — select & copy manually.');
  }
}

// -------------------------
// Init
// -------------------------
(async function init() {
  await ensureUserAndMaybeCredit();
  subscribeToUser();
})();