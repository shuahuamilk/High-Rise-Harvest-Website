// ============================================================
//  admin.js — Auth gate + moderation dashboard
//  Covers: Player Feedback (pending/approved/rejected) and
//  Dev Log Comments (view + delete across all dev logs).
//  Only accounts created manually in Firebase Console →
//  Authentication can sign in here.
// ============================================================

function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const auth = firebase.auth();

const loginEl = document.getElementById("adminLogin");
const dashboardEl = document.getElementById("adminDashboard");
const loginBtn = document.getElementById("adminLoginBtn");
const logoutBtn = document.getElementById("adminLogoutBtn");
const loginError = document.getElementById("adminLoginError");
const listEl = document.getElementById("adminList");
const statusTabs = document.querySelectorAll("#feedbackSection .admin-tab-btn");
const sectionTabs = document.querySelectorAll(".admin-section-tabs .admin-tab-btn");
const feedbackSection = document.getElementById("feedbackSection");
const commentsSection = document.getElementById("commentsSection");

let currentStatus = "pending";
let unsubscribeList = null;
let unsubscribeComments = null;
let commentsLoaded = false;

// ─── NOTIFICATION BADGE HELPERS ───────────────────────────────
let unsubscribeFeedbackBadge = null;
let unsubscribeCommentsBadge = null;

function createNotifDot() {
    const dot = document.createElement("span");
    dot.className = "notif-dot";
    return dot;
}

function showDot(btn) {
    let dot = btn.querySelector(".notif-dot");
    if (!dot) {
        dot = createNotifDot();
        btn.appendChild(dot);
    }
    dot.classList.add("visible");
}

function hideDot(btn) {
    const dot = btn.querySelector(".notif-dot");
    if (dot) dot.classList.remove("visible");
}

// ─── FEEDBACK BADGE: watches pending count ────────────────────
function startFeedbackBadge() {
    const feedbackTabBtn = document.querySelector('.admin-section-tabs .admin-tab-btn[data-section="feedback"]');
    if (!feedbackTabBtn) return;

    if (unsubscribeFeedbackBadge) unsubscribeFeedbackBadge();

    unsubscribeFeedbackBadge = db.collection("feedback")
        .where("status", "==", "pending")
        .onSnapshot((snap) => {
            if (!snap.empty) {
                showDot(feedbackTabBtn);
            } else {
                hideDot(feedbackTabBtn);
            }
        }, (err) => {
            console.warn("Feedback badge listener error:", err);
        });
}

// ─── COMMENTS BADGE: watches for new comments since last seen ─
const ADMIN_COMMENTS_SEEN_KEY = "hrh_admin_comments_seen";

function getAdminCommentsSeenTime() {
    return parseInt(localStorage.getItem(ADMIN_COMMENTS_SEEN_KEY) || "0", 10);
}

function markAdminCommentsAsSeen() {
    localStorage.setItem(ADMIN_COMMENTS_SEEN_KEY, Date.now().toString());
}

function startCommentsBadge() {
    const commentsTabBtn = document.querySelector('.admin-section-tabs .admin-tab-btn[data-section="comments"]');
    if (!commentsTabBtn) return;

    if (unsubscribeCommentsBadge) unsubscribeCommentsBadge();

    const seenTime = getAdminCommentsSeenTime();
    // Use a Firestore Timestamp for comparison
    const seenTimestamp = firebase.firestore.Timestamp.fromMillis(seenTime);

    unsubscribeCommentsBadge = db.collectionGroup("comments")
        .orderBy("timestamp", "desc")
        .limit(1)
        .onSnapshot((snap) => {
            if (!snap.empty) {
                const latestDoc = snap.docs[0];
                const latestTs = latestDoc.data().timestamp;
                // Show dot if the latest comment is newer than what admin last saw
                if (latestTs && latestTs.toMillis && latestTs.toMillis() > seenTime) {
                    showDot(commentsTabBtn);
                } else {
                    hideDot(commentsTabBtn);
                }
            } else {
                hideDot(commentsTabBtn);
            }
        }, (err) => {
            console.warn("Comments badge listener error:", err);
        });
}

function stopBadgeListeners() {
    if (unsubscribeFeedbackBadge) { unsubscribeFeedbackBadge(); unsubscribeFeedbackBadge = null; }
    if (unsubscribeCommentsBadge) { unsubscribeCommentsBadge(); unsubscribeCommentsBadge = null; }
}

loginBtn.addEventListener("click", async () => {
    loginError.textContent = "";
    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        loginError.textContent = "Invalid email or password.";
    }
});

logoutBtn.addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged((user) => {
    if (user) {
        loginEl.style.display = "none";
        dashboardEl.style.display = "block";
        loadFeedbackTab(currentStatus);
        // Start badge listeners after login
        startFeedbackBadge();
        startCommentsBadge();
    } else {
        loginEl.style.display = "flex";
        dashboardEl.style.display = "none";
        if (unsubscribeList) unsubscribeList();
        if (unsubscribeComments) unsubscribeComments();
        commentsLoaded = false;
        stopBadgeListeners();
    }
});

// ─── SECTION SWITCHING (Feedback vs Comments) ────────────────
sectionTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        sectionTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const section = tab.dataset.section;
        feedbackSection.style.display = section === "feedback" ? "block" : "none";
        commentsSection.style.display = section === "comments" ? "block" : "none";
        if (section === "comments") {
            // Mark comments as seen and hide the dot
            markAdminCommentsAsSeen();
            const commentsTabBtn = document.querySelector('.admin-section-tabs .admin-tab-btn[data-section="comments"]');
            if (commentsTabBtn) hideDot(commentsTabBtn);
            if (!commentsLoaded) {
                loadComments();
                commentsLoaded = true;
            }
        }
    });
});

// ─── FEEDBACK STATUS TABS ─────────────────────────────────────
statusTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        statusTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentStatus = tab.dataset.status;
        loadFeedbackTab(currentStatus);
    });
});

function formatAdminDate(ts) {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function makeBtn(label, cls, onClick) {
    const btn = document.createElement("button");
    btn.className = `admin-btn ${cls}`;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
}

// ─── FEEDBACK MODERATION ──────────────────────────────────────
function buildAdminCard(doc) {
    const data = doc.data();
    const id = doc.id;

    const card = document.createElement("div");
    card.className = "admin-card";

    const badges = [];
    if (data.autoModerated) badges.push(`<span class="admin-badge">Auto-censored</span>`);
    if (data.flagged) badges.push(`<span class="admin-badge">Flagged</span>`);

    card.innerHTML = `
        <div class="admin-card-meta">
            <span>${escapeHtml(data.name || "Anonymous")}</span>
            <span>${escapeHtml(data.category || "General")}</span>
            <span>${formatAdminDate(data.timestamp)}</span>
            ${badges.join("")}
        </div>
        <p class="admin-card-message">${escapeHtml(data.message)}</p>
        <div class="admin-card-actions"></div>
    `;

    const actions = card.querySelector(".admin-card-actions");
    if (currentStatus !== "approved") actions.appendChild(makeBtn("Approve", "approve", () => updateStatus(id, "approved")));
    if (currentStatus !== "rejected") actions.appendChild(makeBtn("Reject", "reject", () => updateStatus(id, "rejected")));
    if (currentStatus !== "pending") actions.appendChild(makeBtn("Back to Pending", "restore", () => updateStatus(id, "pending")));
    actions.appendChild(makeBtn("Delete", "delete", () => deleteFeedback(id)));

    return card;
}

async function updateStatus(id, status) {
    await db.collection("feedback").doc(id).update({ status });
}

async function deleteFeedback(id) {
    if (!confirm("Permanently delete this feedback?")) return;
    await db.collection("feedback").doc(id).delete();
}

function renderSkeletonCards(container, count = 3) {
    container.innerHTML = Array.from({ length: count }, () => `
        <div class="skeleton-card">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line full"></div>
            <div class="skeleton-line long"></div>
        </div>
    `).join("");
}

function loadFeedbackTab(status) {
    if (unsubscribeList) unsubscribeList();
    renderSkeletonCards(listEl);

    unsubscribeList = db.collection("feedback")
        .where("status", "==", status)
        .orderBy("timestamp", "desc")
        .onSnapshot(
            (snap) => {
                listEl.innerHTML = "";
                if (snap.empty) {
                    listEl.innerHTML = `<p class="admin-empty">Nothing here.</p>`;
                    return;
                }
                snap.forEach(doc => listEl.appendChild(buildAdminCard(doc)));
            },
            (err) => {
                console.error(err);
                listEl.innerHTML = `<p class="admin-empty">Couldn't load — check console.</p>`;
            }
        );
}

// ─── DEV LOG COMMENTS MODERATION ──────────────────────────────
function buildCommentAdminCard(doc) {
    const data = doc.data();
    const id = doc.id;
    const logId = doc.ref.parent.parent.id; // devlogs/{logId}/comments/{id}

    const badges = [];
    if (data.autoModerated) badges.push(`<span class="admin-badge">Auto-censored</span>`);
    if (data.flagged) badges.push(`<span class="admin-badge">Flagged</span>`);

    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
        <div class="admin-card-meta">
            <span>${escapeHtml(data.name || "Anonymous")}</span>
            <span>Dev Log ID: ${escapeHtml(logId)}</span>
            <span>${formatAdminDate(data.timestamp)}</span>
            ${badges.join("")}
        </div>
        <p class="admin-card-message">${escapeHtml(data.message)}</p>
        <div class="admin-card-actions"></div>
    `;
    card.querySelector(".admin-card-actions").appendChild(
        makeBtn("Delete", "delete", () => deleteComment(logId, id))
    );
    return card;
}

async function deleteComment(logId, commentId) {
    if (!confirm("Permanently delete this comment?")) return;
    await db.collection("devlogs").doc(logId).collection("comments").doc(commentId).delete();
}

function loadComments() {
    const commentsListEl = document.getElementById("adminCommentsList");
    renderSkeletonCards(commentsListEl, 4);

    unsubscribeComments = db.collectionGroup("comments")
        .orderBy("timestamp", "desc")
        .limit(50)
        .onSnapshot(
            (snap) => {
                commentsListEl.innerHTML = "";
                if (snap.empty) {
                    commentsListEl.innerHTML = `<p class="admin-empty">No comments yet.</p>`;
                    return;
                }
                snap.forEach(doc => commentsListEl.appendChild(buildCommentAdminCard(doc)));
            },
            (err) => {
                console.error(err);
                commentsListEl.innerHTML = `<p class="admin-empty">Couldn't load — check console (see note below about indexes).</p>`;
            }
        );
}