// --- [DATABASE & APP INITIALIZATION] ---

// YOUR PERSONAL FIREBASE CONFIGURATION IS NOW INCLUDED
const firebaseConfig = {
  apiKey: "AIzaSyB1TYSc2keBepN_cMV9oaoHFRdcJaAqG_g",
  authDomain: "taskup-9ba7b.firebaseapp.com",
  projectId: "taskup-9ba7b",
  storageBucket: "taskup-9ba7b.appspot.com",
  messagingSenderId: "319481101196",
  appId: "1:319481101196:web:6cded5be97620d98d974a9",
  measurementId: "G-JNNLG1E49L"
};

// Initialize Firebase using the compat libraries
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- [GLOBAL STATE & CONSTANTS] ---
let userState = {};
let telegramUserId = null;
let isInitialized = false;
const TELEGRAM_BOT_USERNAME = "TaskItUpBot";

const DAILY_TASK_LIMIT = 40;
const AD_REWARD = 250;
const REFERRAL_COMMISSION_RATE = 0.10;
const WITHDRAWAL_MINIMUMS = {
    binancepay: 10000 
};

// --- [CORE APP LOGIC] ---

function initializeApp(tgUser) {
    telegramUserId = tgUser ? tgUser.id.toString() : getFakeUserIdForTesting();
    
    console.log(`Initializing app for User ID: ${telegramUserId}`);
    const userRef = db.collection('users').doc(telegramUserId);

    // Use onSnapshot for REAL-TIME updates to the user's own data.
    userRef.onSnapshot(async (doc) => {
        if (!doc.exists) {
            console.log('New user detected. Creating account...');
            const referrerId = tgUser?.start_param || new URLSearchParams(window.location.search).get('ref');
            
            const newUserState = {
                username: tgUser ? `${tgUser.first_name} ${tgUser.last_name || ''}`.trim() : "User",
                telegramUsername: tgUser ? `@${tgUser.username || tgUser.id}` : `@test_user`,
                profilePicUrl: generatePlaceholderAvatar(telegramUserId),
                balance: 0, tasksCompletedToday: 0, lastTaskTimestamp: null, totalEarned: 0,
                totalAdsViewed: 0, totalRefers: 0, joinedBonusTasks: [],
                referredBy: referrerId || null,
                referralEarnings: 0
            };
            
            // --- FIXED: TRANSACTIONAL REFERRAL CREDIT AT SIGNUP ---
            if (referrerId) {
                const referrerRef = db.collection('users').doc(referrerId);
                try {
                    await db.runTransaction(async (transaction) => {
                        const referrerDoc = await transaction.get(referrerRef);
                        if (!referrerDoc.exists) throw "Referrer not found!";
                        
                        console.log("Crediting referrer instantly upon new user creation.");
                        transaction.update(referrerRef, {
                            totalRefers: firebase.firestore.FieldValue.increment(1)
                        });
                        transaction.set(userRef, newUserState); // Create the new user within the transaction
                    });
                } catch (error) {
                    console.error("Referral transaction failed, creating user normally.", error);
                    await userRef.set(newUserState); // Create user anyway if transaction fails
                }
            } else {
                await userRef.set(newUserState); // Create user if there's no referrer
            }
        } else {
            console.log('User data updated in real-time.');
            userState = doc.data();
        }
        
        if (!isInitialized) {
            setupTaskButtonListeners();
            listenForWithdrawalHistory();
            isInitialized = true;
        }
        updateUI();

    }, (error) => console.error("Error listening to user document:", error));
}

function getFakeUserIdForTesting() { let storedId = localStorage.getItem('localAppUserId'); if (storedId) return storedId; const newId = 'test_user_' + Date.now().toString(36); localStorage.setItem('localAppUserId', newId); return newId; }
function generatePlaceholderAvatar(userId) { return `https://i.pravatar.cc/150?u=${userId}`; }

function updateUI() {
    const balanceString = Math.floor(userState.balance || 0).toLocaleString();
    const totalEarnedString = Math.floor(userState.totalEarned || 0).toLocaleString();
    const referralEarningsString = (userState.referralEarnings || 0).toLocaleString();
    const totalRefersString = (userState.totalRefers || 0).toLocaleString();

    document.querySelectorAll('.profile-pic, .profile-pic-large').forEach(img => { if (userState.profilePicUrl) img.src = userState.profilePicUrl; });
    document.getElementById('balance-home').textContent = balanceString;
    document.getElementById('withdraw-balance').textContent = balanceString;
    document.getElementById('profile-balance').textContent = balanceString;
    document.getElementById('home-username').textContent = userState.username;
    document.getElementById('profile-name').textContent = userState.username;
    document.getElementById('telegram-username').textContent = userState.telegramUsername;
    document.getElementById('ads-watched-today').textContent = userState.tasksCompletedToday || 0;
    document.getElementById('ads-left-today').textContent = DAILY_TASK_LIMIT - (userState.tasksCompletedToday || 0);
    const tasksCompleted = userState.tasksCompletedToday || 0;
    document.getElementById('tasks-completed').textContent = `${tasksCompleted} / ${DAILY_TASK_LIMIT}`;
    const progressPercentage = (tasksCompleted / DAILY_TASK_LIMIT) * 100;
    document.getElementById('task-progress-bar').style.width = `${progressPercentage}%`;
    const taskButton = document.getElementById('start-task-button');
    taskButton.disabled = tasksCompleted >= DAILY_TASK_LIMIT;
    taskButton.innerHTML = tasksCompleted >= DAILY_TASK_LIMIT ? '<i class="fas fa-check-circle"></i> All tasks done' : '<i class="fas fa-play-circle"></i> Watch Ad';
    document.getElementById('earned-so-far').textContent = totalEarnedString;
    document.getElementById('total-ads-viewed').textContent = userState.totalAdsViewed || 0;
    document.getElementById('total-refers').textContent = totalRefersString;
    document.getElementById('refer-earnings').textContent = referralEarningsString;
    document.getElementById('refer-count').textContent = totalRefersString;
    const joinedTasks = userState.joinedBonusTasks || [];
    joinedTasks.forEach(taskId => {
        const taskCard = document.getElementById(`task-${taskId}`);
        if (taskCard) taskCard.classList.add('completed');
    });
}

function renderHistoryItem(withdrawalData) { const item = document.createElement('div'); item.className = `history-item ${withdrawalData.status}`; const date = withdrawalData.requestedAt.toDate ? withdrawalData.requestedAt.toDate() : withdrawalData.requestedAt; const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); item.innerHTML = ` <div class="history-details"> <div class="history-amount">${withdrawalData.amount.toLocaleString()} PEPE</div> <div class="history-date">${formattedDate}</div> </div> <div class="history-status ${withdrawalData.status}"> ${withdrawalData.status} </div> `; return item; }
function listenForWithdrawalHistory() { const historyList = document.getElementById('history-list'); db.collection('withdrawals').where('userId', '==', telegramUserId).orderBy('requestedAt', 'desc').limit(10).onSnapshot(querySnapshot => { if (querySnapshot.empty) { historyList.innerHTML = '<p class="no-history">You have no withdrawal history yet.</p>'; return; } historyList.innerHTML = ''; querySnapshot.forEach(doc => { const withdrawal = doc.data(); const itemElement = renderHistoryItem(withdrawal); historyList.appendChild(itemElement); }); }); }

// --- FIXED: SIMPLIFIED COMMISSION PAYMENT LOGIC ---
async function payReferralCommission(earnedAmount) {
    if (!userState.referredBy) return; // Exit if user was not referred

    const commissionAmount = Math.floor(earnedAmount * REFERRAL_COMMISSION_RATE);
    if (commissionAmount <= 0) return;

    const referrerRef = db.collection('users').doc(userState.referredBy);

    // This simple update is now safe because the referral count is handled at signup.
    return referrerRef.update({
        balance: firebase.firestore.FieldValue.increment(commissionAmount),
        referralEarnings: firebase.firestore.FieldValue.increment(commissionAmount)
    }).catch(error => console.error("Failed to pay commission:", error));
}


function setupTaskButtonListeners() { document.querySelectorAll('.task-card').forEach(card => { const joinBtn = card.querySelector('.join-btn'); const verifyBtn = card.querySelector('.verify-btn'); const taskId = card.dataset.taskId; const url = card.dataset.url; const reward = parseInt(card.dataset.reward); if (joinBtn) { joinBtn.addEventListener('click', () => { handleJoinClick(taskId, url); }); } if (verifyBtn) { verifyBtn.addEventListener('click', () => { handleVerifyClick(taskId, reward); }); } }); }
async function handleVerifyClick(taskId, reward) { if (userState.joinedBonusTasks.includes(taskId)) { alert("You have already completed this task."); return; } const taskCard = document.getElementById(`task-${taskId}`); const verifyButton = taskCard.querySelector('.verify-btn'); verifyButton.disabled = true; verifyButton.textContent = "Verifying..."; try { const userRef = db.collection('users').doc(telegramUserId); await userRef.update({ balance: firebase.firestore.FieldValue.increment(reward), totalEarned: firebase.firestore.FieldValue.increment(reward), joinedBonusTasks: firebase.firestore.FieldValue.arrayUnion(taskId) }); await payReferralCommission(reward); alert(`Verification successful! You've earned ${reward} PEPE.`); } catch (error) { console.error("Error rewarding user for channel join:", error); alert("An error occurred. Please try again."); verifyButton.disabled = false; verifyButton.textContent = "Verify"; } }
function handleJoinClick(taskId, url) { const taskCard = document.getElementById(`task-${taskId}`); if (!taskCard) return; const joinButton = taskCard.querySelector('.join-btn'); const verifyButton = taskCard.querySelector('.verify-btn'); window.open(url, '_blank'); alert("After joining, return to the app and press 'Verify' to claim your reward."); if (verifyButton) verifyButton.disabled = false; if (joinButton) joinButton.disabled = true; }

window.completeAdTask = async function() { if (!userState || (userState.tasksCompletedToday || 0) >= DAILY_TASK_LIMIT) { alert("You have completed all ad tasks for today!"); return; } const taskButton = document.getElementById('start-task-button'); try { taskButton.disabled = true; taskButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading Ad...'; await window.show_9685198(); const userRef = db.collection('users').doc(telegramUserId); await userRef.update({ balance: firebase.firestore.FieldValue.increment(AD_REWARD), totalEarned: firebase.firestore.FieldValue.increment(AD_REWARD), tasksCompletedToday: firebase.firestore.FieldValue.increment(1), totalAdsViewed: firebase.firestore.FieldValue.increment(1), lastTaskTimestamp: firebase.firestore.FieldValue.serverTimestamp() }); await payReferralCommission(AD_REWARD); alert(`Success! ${AD_REWARD} PEPE has been added to your balance.`); } catch (error) { console.error("An error occurred during the ad task:", error); alert("Ad could not be shown or was closed early. Please try again."); } finally { updateUI(); } }
window.submitWithdrawal = async function() { const amount = parseInt(document.getElementById('withdraw-amount').value); const method = document.getElementById('withdraw-method').value; const walletId = document.getElementById('wallet-id').value.trim(); const minAmount = WITHDRAWAL_MINIMUMS[method]; if (isNaN(amount) || amount <= 0 || !walletId) { alert('Please enter a valid amount and your Binance ID or Email.'); return; } if (amount < minAmount) { alert(`Withdrawal failed. The minimum is ${minAmount.toLocaleString()} PEPE.`); return; } if (amount > userState.balance) { alert('Withdrawal failed. You do not have enough balance.'); return; } try { const historyList = document.getElementById('history-list'); const noHistoryMsg = historyList.querySelector('.no-history'); if (noHistoryMsg) { noHistoryMsg.remove(); } const optimisticData = { amount: amount, status: 'pending', requestedAt: new Date() }; const optimisticItem = renderHistoryItem(optimisticData); historyList.prepend(optimisticItem); await db.collection('withdrawals').add({ userId: telegramUserId, username: userState.telegramUsername, amount: amount, method: "Binance Pay", walletId: walletId, currency: "PEPE", status: "pending", requestedAt: firebase.firestore.FieldValue.serverTimestamp() }); const userRef = db.collection('users').doc(telegramUserId); await userRef.update({ balance: firebase.firestore.FieldValue.increment(-amount) }); alert(`Success! Your withdrawal request for ${amount.toLocaleString()} PEPE has been submitted.`); document.getElementById('withdraw-amount').value = ''; document.getElementById('wallet-id').value = ''; } catch (error) { console.error("Withdrawal failed:", error); alert("There was an error submitting your request. Please try again."); } }

// --- [UTILITY FUNCTIONS] ---
window.showTab = function(tabName, element) { document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); document.getElementById(tabName).classList.add('active'); document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active')); element.classList.add('active'); }
window.openReferModal = function() { if (!TELEGRAM_BOT_USERNAME) { alert("Error: Bot username not set."); return; } const referralLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${telegramUserId}`; document.getElementById('referral-link').value = referralLink; document.getElementById('refer-modal').style.display = 'flex'; }
window.closeReferModal = function() { document.getElementById('refer-modal').style.display = 'none'; }
window.copyReferralLink = function(button) { const linkInput = document.getElementById('referral-link'); navigator.clipboard.writeText(linkInput.value).then(() => { const originalIcon = button.innerHTML; button.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { button.innerHTML = originalIcon; }, 1500); }).catch(err => console.error('Failed to copy text: ', err)); }
window.onclick = function(event) { if (event.target == document.getElementById('refer-modal')) { closeReferModal(); } }

// --- [APP ENTRY POINT] ---
document.addEventListener('DOMContentLoaded', () => {
    if (window.Telegram && window.Telegram.WebApp) {
        Telegram.WebApp.ready();
        initializeApp(window.Telegram.WebApp.initDataUnsafe.user);
    } else {
        console.warn("Telegram script not found. Running in browser test mode.");
        initializeApp(null);
    }
});

// ===== AUTO REFERRAL & EARNINGS BONUS =====
firebase.initializeApp({
  apiKey: "AIzaSyDS-X4ZRHlLIBOZJsYKc9oGnNrL6k0J50U",
  authDomain: "taskup-47d9c.firebaseapp.com",
  projectId: "taskup-47d9c",
  storageBucket: "taskup-47d9c.firebasestorage.app",
  messagingSenderId: "889706397464",
  appId: "1:889706397464:web:12e95e738f3f42ba08a86d",
  measurementId: "G-FDKNRDJXQS"
});
const db = firebase.firestore();
const BOT_USERNAME = "Taskup_official_bot";
const REFERRAL_RATE = 0.10;

// Get Telegram user or fallback
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) tg.ready();
const tgUser = tg?.initDataUnsafe?.user || null;
const userId = tgUser ? String(tgUser.id) : ('demo_' + Math.floor(Math.random()*1000000));

// Detect referrer from URL (?start=REFERRER_ID)
function getParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch(e) { return null; }
}
const refFromUrl = getParam('start');

// Ensure user exists and credit referrer once
async function ensureUser() {
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const newUser = {
      name: (tgUser?.first_name || 'User') + (tgUser?.last_name ? (' ' + tgUser.last_name) : ''),
      username: tgUser?.username ? ('@' + tgUser.username) : '',
      profilePicUrl: tgUser?.photo_url || `https://i.pravatar.cc/150?u=${userId}`,
      balance: 0,
      earnedSoFar: 0,
      adsViewed: 0,
      referrals: 0,
      referralEarnings: 0,
      referrer: refFromUrl || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await userRef.set(newUser);
    if (refFromUrl && refFromUrl !== userId) {
      const referrerRef = db.collection('users').doc(String(refFromUrl));
      await db.runTransaction(async (tx) => {
        const refSnap = await tx.get(referrerRef);
        if (refSnap.exists) {
          tx.update(referrerRef, { referrals: firebase.firestore.FieldValue.increment(1) });
        }
      });
    }
  }
}

// Subscribe to user doc updates
function subscribeUser() {
  db.collection('users').doc(userId).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    document.getElementById('profile-name').innerText = data.name || 'User';
    document.getElementById('telegram-username').innerText = data.username || '@username';
    document.getElementById('profile-balance').innerText = data.balance ?? 0;
    document.getElementById('earned-so-far').innerText = data.earnedSoFar ?? 0;
    document.getElementById('total-ads-viewed').innerText = data.adsViewed ?? 0;
    document.getElementById('total-refers').innerText = data.referrals ?? 0;
    document.getElementById('refer-earnings').innerText = data.referralEarnings ?? 0;
    const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    const rl = document.getElementById('referral-link');
    if (rl) rl.value = link;
    document.getElementById('refer-count').innerText = data.referrals ?? 0;
    document.getElementById('refer-earnings').innerText = data.referralEarnings ?? 0;
  });
}

// Add earnings and credit referrer bonus
async function addEarnings(amount) {
  const userRef = db.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return;
  const data = snap.data();
  await userRef.update({
    balance: firebase.firestore.FieldValue.increment(amount),
    earnedSoFar: firebase.firestore.FieldValue.increment(amount),
    adsViewed: firebase.firestore.FieldValue.increment(1)
  });
  if (data.referrer) {
    const bonus = Math.round(amount * REFERRAL_RATE * 100) / 100;
    const referrerRef = db.collection('users').doc(String(data.referrer));
    await referrerRef.update({
      balance: firebase.firestore.FieldValue.increment(bonus),
      referralEarnings: firebase.firestore.FieldValue.increment(bonus)
    });
  }
}

// Test earn function
function testEarn() {
  addEarnings(10).then(() => alert('Added 10 PEPE — referrer gets 10% if any.'));
}

// Init
ensureUser().then(() => subscribeUser());
