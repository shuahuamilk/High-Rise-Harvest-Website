// ============================================================
//  feedback.js — Player Feedback form, moderation, public feed
//  Relies on `db` (firebase.js) and `escapeHtml` (devlogs.js)
//  already being loaded on the page.
// ============================================================

const FEEDBACK_REACTION_EMOJIS = ["🔥", "❤️", "👏", "🌱"];
const FEEDBACK_COOLDOWN_MS = 60_000; // 1 minute between submissions

// Moderation (BLOCK_TERMS, CENSOR_TERMS, moderateMessage, etc.) now lives
// in moderation.js, loaded before this file — see index.html script order.

// cooldown timer for feedback submission
function getLastFeedbackTime() {
    return parseInt(localStorage.getItem("hrh_last_feedback") || "0", 10);
}

function setLastFeedbackTime() {
    localStorage.setItem("hrh_last_feedback", Date.now().toString());
}


// ─── SUBMIT ─────────────────────────────────────────────────
async function submitFeedback(name, category, rawMessage) {
    const trimmedName = name.trim() || "Anonymous";
    const trimmedMessage = rawMessage.trim();

    if (!trimmedMessage) throw new Error("Please write some feedback before submitting.");
    if (trimmedMessage.length > 600) throw new Error("Feedback is too long (max 600 characters).");

    const elapsed = Date.now() - getLastFeedbackTime();
    if (elapsed < FEEDBACK_COOLDOWN_MS) {
        const wait = Math.ceil((FEEDBACK_COOLDOWN_MS - elapsed) / 1000);
        throw new Error(`Please wait ${wait}s before submitting again.`);
    }
    
    const nameModeration = moderateMessage(trimmedName);
    if (!nameModeration.allowed) throw new Error("Your name contains language that isn't allowed. Please use a different name.");

    const moderation = moderateMessage(trimmedMessage);
    if (!moderation.allowed) throw new Error(moderation.reason);

    await db.collection("feedback").add({
        name: trimmedName.slice(0, 40),
        category,
        message: moderation.message,
        status: "pending",
        autoModerated: moderation.autoModerated,
        flagged: moderation.flagged,
        reactions: {},
        reactionTotal: 0,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    setLastFeedbackTime();
}

// ─── PUBLIC FEED (approved only, top-reacted first) ──────────
function formatFeedbackDate(ts) {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getFeedbackReactionKey(id) {
    return `hrh_fb_reactions_${id}`;
}

function getFeedbackUserReactions(id) {
    try {
        return JSON.parse(localStorage.getItem(getFeedbackReactionKey(id))) || [];
    } catch {
        return [];
    }
}

function toggleFeedbackReaction(id, emoji) {
    const ref = db.collection("feedback").doc(id);
    const userReacted = getFeedbackUserReactions(id).includes(emoji);

    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data() || {};
        const reactions = { ...(data.reactions || {}) };
        const current = reactions[emoji] || 0;
        reactions[emoji] = userReacted ? Math.max(0, current - 1) : current + 1;
        const total = Object.values(reactions).reduce((sum, n) => sum + n, 0);
        tx.update(ref, { reactions, reactionTotal: total });
    }).then(() => {
        const existing = getFeedbackUserReactions(id);
        const updated = userReacted ? existing.filter(e => e !== emoji) : [...existing, emoji];
        localStorage.setItem(getFeedbackReactionKey(id), JSON.stringify(updated));
    });
}

// ─── FEEDBACK CARD REGISTRY (for live reaction updates) ──────
const _feedbackCardRegistry = {}; // id → card element

function buildFeedbackCard(doc) {
    const data = doc.data();
    const id = doc.id;
    const userReacted = getFeedbackUserReactions(id);

    const card = document.createElement("div");
    card.className = "feedback-card";
    card.dataset.feedbackId = id;
    card.innerHTML = `
        <div class="feedback-card-meta">
            <span class="news-tag">${escapeHtml(data.category || "General")}</span>
            <span class="feedback-card-name">${escapeHtml(data.name || "Anonymous")}</span>
            <span class="feedback-card-date">${formatFeedbackDate(data.timestamp)}</span>
        </div>
        <p class="feedback-card-message">${escapeHtml(data.message)}</p>
        <div class="devlog-reactions">
            ${FEEDBACK_REACTION_EMOJIS.map(e => `
                <button class="reaction-btn ${userReacted.includes(e) ? "reacted" : ""}" data-emoji="${e}" data-id="${id}">
                    <span class="reaction-emoji">${e}</span>
                    <span class="reaction-count">${(data.reactions && data.reactions[e]) || 0}</span>
                </button>
            `).join("")}
        </div>
    `;

    card.querySelectorAll(".reaction-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            try {
                await toggleFeedbackReaction(id, btn.dataset.emoji);
            } catch (e) {
                console.error(e);
            } finally {
                btn.disabled = false;
            }
        });
    });

    _feedbackCardRegistry[id] = card;
    return card;
}

// Update a card's reaction counts in real-time without rebuilding it
function updateFeedbackCardReactions(id, reactions) {
    const card = _feedbackCardRegistry[id];
    if (!card) return;
    const userReacted = getFeedbackUserReactions(id);
    FEEDBACK_REACTION_EMOJIS.forEach(e => {
        const btn = card.querySelector(`.reaction-btn[data-emoji="${e}"]`);
        if (!btn) return;
        btn.querySelector(".reaction-count").textContent = (reactions && reactions[e]) || 0;
        btn.classList.toggle("reacted", userReacted.includes(e));
    });
}

// Track per-card Firestore listeners so we can clean them up
const _feedbackReactionUnsubs = {};

function listenApprovedFeedback() {
    const feed = document.getElementById("feedbackFeed");
    const loading = document.getElementById("feedbackLoading");

    db.collection("feedback")
        .where("status", "==", "approved")
        .orderBy("reactionTotal", "desc")
        .limit(20)
        .onSnapshot(
            (snap) => {
                loading.style.display = "none";

                // Clean up old per-card listeners
                Object.values(_feedbackReactionUnsubs).forEach(u => u());
                Object.keys(_feedbackReactionUnsubs).forEach(k => delete _feedbackReactionUnsubs[k]);
                Object.keys(_feedbackCardRegistry).forEach(k => delete _feedbackCardRegistry[k]);

                feed.innerHTML = "";
                if (snap.empty) {
                    feed.innerHTML = `<p class="feedback-empty">No feedback yet — be the first to share yours!</p>`;
                    return;
                }

                snap.forEach(doc => {
                    const card = buildFeedbackCard(doc);
                    feed.appendChild(card);

                    // Subscribe to live reaction updates for this card
                    const unsub = db.collection("feedback").doc(doc.id)
                        .onSnapshot((liveSnap) => {
                            if (liveSnap.exists) {
                                updateFeedbackCardReactions(doc.id, liveSnap.data().reactions);
                            }
                        }, () => { /* silently ignore */ });
                    _feedbackReactionUnsubs[doc.id] = unsub;
                });
            },
            (err) => {
                console.error(err);
                loading.textContent = "Couldn't load feedback right now.";
            }
        );
}

// ─── INIT ─────────────────────────────────────────────────────
async function initFeedbackForm() {
    const form = document.getElementById("feedbackForm");
    const nameInput = document.getElementById("feedbackName");
    const categoryInput = document.getElementById("feedbackCategory");
    const messageInput = document.getElementById("feedbackMessage");
    const errorEl = document.getElementById("feedbackError");
    const successEl = document.getElementById("feedbackSuccess");
    const submitBtn = document.getElementById("feedbackSubmitBtn");

    if (!form) return;

    form.addEventListener("submit", async function (e) {
        // STOP PAGE REFRESH
        e.preventDefault();
        e.stopPropagation();

        try {
            errorEl.textContent = "";
            successEl.style.display = "none";

            const name = (nameInput.value || "").trim() || "Anonymous";
            const category = categoryInput.value;
            const message = messageInput.value.trim();

            if (!message) {
                errorEl.textContent = "Please enter feedback.";
                return false;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";

            // Use the existing submitFeedback function with full moderation
            await submitFeedback(name, category, message);

            form.reset();

            successEl.style.display = "block";
            successEl.textContent =
                "Thanks! Your feedback has been submitted for review.";

        } catch (err) {
            console.error(err);
            errorEl.textContent = err.message || "Unable to submit feedback. Please try again.";
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Feedback";
        }

        return false;
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    initFeedbackForm();
    listenApprovedFeedback();
});