// script.js - compat Firebase + Telegram + auto-referral (global functions)

// init checks and logs
try {
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    console.log("Telegram WebApp ready");
  } else {
    console.log("Telegram WebApp not available - running in browser mode");
  }
} catch (e) {
  console.error("Telegram init error", e);
}

// Firebase config (compat)
const firebaseConfig = {
  apiKey: "AIzaSyB1TYSc2keBepN_cMV9oaoHFRdcJaAqG_g",
  authDomain: "taskup-9ba7b.firebaseapp.com",
  projectId: "taskup-9ba7b",
  storageBucket: "taskup-9ba7b.appspot.com",
  messagingSenderId: "319481101196",
  appId: "1:319481101196:web:6cded5be97620d98d974a9",
  measurementId: "G-JNNLG1E49L"
};

try {
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase initialized");
} catch (e) {
  console.error("Firebase init error", e);
}

const db = firebase.firestore();

// determine user id
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const tgUser = tg?.initDataUnsafe?.user || null;
const userId = tgUser ? String(tgUser.id) : ('demo_' + Math.floor(Math.random()*1000000));
console.log("UserId:", userId);

// detect referrer from URL (?start= or ?ref=)
function getParam(name) {
  try { return new URLSearchParams(window.location.search).get(name); } catch(e) { return null; }
}
const refFromUrl = getParam('start') || getParam('ref') || null;
console.log("refFromUrl:", refFromUrl);

// ensure user exists and credit referrer once (compat transaction)
function ensureUserAndCredit() {
  const userRef = db.collection('users').doc(userId);
  userRef.get().then(doc => {
    if (!doc.exists) {
      const newUser = {
        name: (tgUser?.first_name || 'User') + (tgUser?.last_name ? (' ' + tgUser.last_name) : ''),
        username: tgUser?.username ? ('@' + tgUser.username) : '',
        balance: 0,
        earnedSoFar: 0,
        adsViewed: 0,
        referrals: 0,
        referralEarnings: 0,
        referrer: refFromUrl || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      userRef.set(newUser).then(() => {
        console.log("User created");
        if (refFromUrl && refFromUrl !== userId) {
          const referrerRef = db.collection('users').doc(String(refFromUrl));
          // increment referrer safely
          referrerRef.get().then(rdoc => {
            if (rdoc.exists) {
              referrerRef.update({ referrals: firebase.firestore.FieldValue.increment(1) }).then(() => {
                console.log("Referrer incremented");
              }).catch(e => console.error("Ref update failed", e));
            } else {
              console.log("Referrer doc not found");
            }
          }).catch(e => console.error("Referrer lookup failed", e));
        }
      }).catch(e => console.error("User set failed", e));
    } else {
      console.log("User exists");
    }
  }).catch(e => console.error("User get failed", e));
}

// subscribe to user doc for real-time updates
function subscribeUser() {
  const userRef = db.collection('users').doc(userId);
  userRef.onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    try {
      document.getElementById('profile-name').innerText = data.name || 'User';
      document.getElementById('telegram-username').innerText = data.username || '@username';
      document.getElementById('profile-balance').innerText = data.balance ?? 0;
      document.getElementById('earned-so-far').innerText = data.earnedSoFar ?? 0;
      document.getElementById('total-ads-viewed').innerText = data.adsViewed ?? 0;
      document.getElementById('total-refers').innerText = data.referrals ?? 0;
      document.getElementById('refer-earnings').innerText = data.referralEarnings ?? 0;
      const link = `https://t.me/Taskup_official_bot?start=${userId}`;
      const rl = document.getElementById('referral-link');
      if (rl) rl.value = link;
      const referCount = document.getElementById('refer-count');
      if (referCount) referCount.innerText = data.referrals ?? 0;
    } catch (e) {
      console.error("UI update error", e);
    }
  }, err => console.error("Snapshot error", err));
}

// add earnings and pay 10% commission if referrer exists
async function addEarnings(amount) {
  try {
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) { alert("User not initialized"); return; }
    const data = snap.data();
    await userRef.update({
      balance: firebase.firestore.FieldValue.increment(amount),
      earnedSoFar: firebase.firestore.FieldValue.increment(amount),
      adsViewed: firebase.firestore.FieldValue.increment(1)
    });
    if (data.referrer) {
      const bonus = Math.round(amount * 0.10 * 100) / 100;
      const refRef = db.collection('users').doc(String(data.referrer));
      await refRef.update({
        balance: firebase.firestore.FieldValue.increment(bonus),
        referralEarnings: firebase.firestore.FieldValue.increment(bonus)
      });
    }
    console.log("Earnings added");
  } catch (e) {
    console.error("addEarnings error", e);
  }
}

// expose global functions used by HTML onclick attributes
window.openReferModal = function () {
  const modal = document.getElementById('refer-modal');
  if (modal) modal.style.display = 'flex';
};
window.closeReferModal = function () {
  const modal = document.getElementById('refer-modal');
  if (modal) modal.style.display = 'none';
};
window.copyReferralLink = function (btn) {
  try {
    const input = document.getElementById('referral-link');
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value);
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => btn.innerHTML = '<i class="fas fa-copy"></i>', 1000);
  } catch (e) {
    console.error("copy failed", e);
    alert('Copy failed — please select and copy manually.');
  }
};
window.showTab = function (tabId, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
};
window.testEarn = function () { addEarnings(10).then(()=>alert('Added 10 PEPE')); };

// simple join/verify handlers (global)
window.handleJoinClick = function(taskId, url) {
  try {
    window.open(url, '_blank');
    const verifyBtn = document.getElementById('verify_' + taskId);
    if (verifyBtn) verifyBtn.disabled = false;
    alert("Opened join link. After joining, press Verify.");
  } catch(e) { console.error(e); }
};
window.handleVerifyClick = async function(taskId, reward) {
  try {
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      balance: firebase.firestore.FieldValue.increment(reward),
      earnedSoFar: firebase.firestore.FieldValue.increment(reward),
      adsViewed: firebase.firestore.FieldValue.increment(0)
    });
    // pay ref commission
    const snap = await userRef.get();
    const data = snap.data();
    if (data.referrer) {
      const bonus = Math.round(reward * 0.10 * 100) / 100;
      const refRef = db.collection('users').doc(String(data.referrer));
      await refRef.update({
        balance: firebase.firestore.FieldValue.increment(bonus),
        referralEarnings: firebase.firestore.FieldValue.increment(bonus)
      });
    }
    alert('Verified and rewarded ' + reward + ' PEPE');
  } catch(e) { console.error('verify error', e); alert('Verification failed.'); }
};

// start
ensureUserAndCredit();
subscribeUser();
