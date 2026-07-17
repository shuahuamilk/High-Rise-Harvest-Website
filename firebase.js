// ============================================================
//  firebase.js  —  Reactions & Comments via Firebase Firestore
//  Uses CDN (compat) SDK — no bundler needed
// ============================================================

// NOTE: The <script> tags in index.html load Firebase before this file.
// This file just uses the global `firebase` object they expose.

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyC1Ecnk-AOD6sfv9PQYoWawPx1_GP5Fke8",
    authDomain: "high-rise-harvest.firebaseapp.com",
    projectId: "high-rise-harvest",
    storageBucket: "high-rise-harvest.firebasestorage.app",
    messagingSenderId: "1070053167474",
    appId: "1:1070053167474:web:03de8cd7b3700d5a3d0deb"
};

// Initialize (guard against double-init)
if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}

const db = firebase.firestore();

// ─── REACTIONS ──────────────────────────────────────────────
// Firestore doc: devlogs/{logId}/reactions (single doc "counts")
// Shape: { "🔥": 12, "❤️": 5, "👏": 3 }
// LocalStorage tracks which reactions THIS browser has already sent.

const REACTION_EMOJIS = ["🔥", "❤️", "👏", "🌱"];

function getReactionStorageKey(logId) {
    return `hrh_reactions_${logId}`;
}

function getUserReactions(logId) {
    try {
        return JSON.parse(localStorage.getItem(getReactionStorageKey(logId))) || [];
    } catch {
        return [];
    }
}

function saveUserReaction(logId, emoji) {
    const existing = getUserReactions(logId);
    if (!existing.includes(emoji)) {
        existing.push(emoji);
        localStorage.setItem(getReactionStorageKey(logId), JSON.stringify(existing));
    }
}

function removeUserReaction(logId, emoji) {
    const existing = getUserReactions(logId).filter(e => e !== emoji);
    localStorage.setItem(getReactionStorageKey(logId), JSON.stringify(existing));
}

async function toggleReaction(logId, emoji) {
    const ref = db.collection("devlogs").doc(logId).collection("meta").doc("reactions");
    const userReacted = getUserReactions(logId).includes(emoji);

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const current = data[emoji] || 0;
        const next = userReacted ? Math.max(0, current - 1) : current + 1;
        tx.set(ref, { ...data, [emoji]: next }, { merge: true });
    });

    if (userReacted) {
        removeUserReaction(logId, emoji);
    } else {
        saveUserReaction(logId, emoji);
    }
}

function listenReactions(logId, callback) {
    const ref = db.collection("devlogs").doc(logId).collection("meta").doc("reactions");
    return ref.onSnapshot((snap) => {
        callback(snap.exists ? snap.data() : {});
    });
}

// ─── COMMENTS ───────────────────────────────────────────────
// Firestore collection: devlogs/{logId}/comments
// Each doc: { name, message, timestamp }
// Rate-limit: localStorage stores last comment time per log

const COMMENT_COOLDOWN_MS = 30_000; // 30 seconds

function getLastCommentTime(logId) {
    return parseInt(localStorage.getItem(`hrh_lastcomment_${logId}`) || "0", 10);
}

function setLastCommentTime(logId) {
    localStorage.setItem(`hrh_lastcomment_${logId}`, Date.now().toString());
}

async function postComment(logId, name, message) {
    const trimmedName = name.trim();
    const trimmedMsg = message.trim();

    if (!trimmedName || !trimmedMsg) throw new Error("Name and message are required.");
    if (trimmedName.length > 40) throw new Error("Name is too long (max 40 characters).");
    if (trimmedMsg.length > 500) throw new Error("Message is too long (max 500 characters).");

    const elapsed = Date.now() - getLastCommentTime(logId);
    if (elapsed < COMMENT_COOLDOWN_MS) {
        const wait = Math.ceil((COMMENT_COOLDOWN_MS - elapsed) / 1000);
        throw new Error(`Please wait ${wait}s before commenting again.`);
    }

    const nameModeration = moderateMessage(trimmedName);
    if (!nameModeration.allowed) throw new Error("Your name contains language that isn't allowed. Please use a different name.");

    const moderation = moderateMessage(trimmedMsg);
    if (!moderation.allowed) throw new Error(moderation.reason);

    await db.collection("devlogs").doc(logId).collection("comments").add({
        name: trimmedName,
        message: moderation.message,
        autoModerated: moderation.autoModerated,
        flagged: moderation.flagged,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Remember the user's display name for next time
    localStorage.setItem("hrh_commenter_name", trimmedName);
    setLastCommentTime(logId);
}

function listenComments(logId, callback) {
    return db.collection("devlogs").doc(logId).collection("comments")
        .orderBy("timestamp", "asc")
        .onSnapshot((snap) => {
            const comments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(comments);
        });
}

function getSavedName() {
    return localStorage.getItem("hrh_commenter_name") || "";
}
