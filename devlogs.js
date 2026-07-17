// ============================================================
//  devlogs.js  —  Google Sheets CMS + Dev Log UI
// ============================================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRXkFf6uGyNY25WiNyGJmtez8bfiXS-S1FtjcM_GGBZIF13cYu0g6Drrgrtfiz9cyYqutjhHvUxzTMo/pub?gid=0&single=true&output=csv";

// ─── CSV PARSER ──────────────────────────────────────────────
function parseCSV(text) {
    const lines = text.trim().split("\n");
    const headers = splitCSVLine(lines[0]);
    return lines.slice(1).map(line => {
        const values = splitCSVLine(line);
        const obj = {};
        headers.forEach((h, i) => {
            obj[h.trim()] = (values[i] || "").trim();
        });
        return obj;
    }).filter(row => row.id); // skip empty rows
}

// Handles quoted fields with commas inside
function splitCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// ─── FETCH LOGS ──────────────────────────────────────────────
async function fetchDevLogs() {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error("Failed to fetch dev logs.");
    const text = await res.text();
    return parseCSV(text);
}

// ─── RENDER HELPERS ──────────────────────────────────────────
function formatTimestamp(ts) {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Simple line-break and bold renderer (no full markdown lib needed)
function renderContent(text) {
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>");
}

// ─── BUILD DEVLOG CARD ────────────────────────────────────────
function buildLogCard(log) {
    const card = document.createElement("div");
    card.className = "news-card devlog-card";
    card.dataset.logId = log.id;
    card.innerHTML = `
        <span class="news-tag">${escapeHtml(log.tag || "Dev Log")}</span>
        <p class="news-date">${escapeHtml(log.date)}</p>
        <h3>${escapeHtml(log.title)}</h3>
        <p>${escapeHtml(log.summary)}</p>
        <button class="btn-news btn-open-log" data-id="${escapeHtml(log.id)}">Read More</button>
    `;
    return card;
}

// ─── MODAL ────────────────────────────────────────────────────
let activeListeners = []; // track Firestore unsubscribes

function closeLogModal() {
    const modal = document.getElementById("devlogModal");
    if (modal) {
        modal.style.display = "none";
        modal.querySelector(".devlog-modal-body").innerHTML = "";
    }
    // Unsubscribe all Firestore listeners
    activeListeners.forEach(unsub => unsub());
    activeListeners = [];
}

function openLogModal(log) {
    const modal = document.getElementById("devlogModal");
    const body = modal.querySelector(".devlog-modal-body");

    body.innerHTML = `
        <p class="news-date">${escapeHtml(log.date)}</p>
        <h2 class="devlog-modal-title">${escapeHtml(log.title)}</h2>
        <div class="devlog-modal-divider"></div>
        <div class="devlog-modal-content"><p>${renderContent(log.content || log.summary)}</p></div>

        <!-- REACTIONS -->
        <div class="devlog-reactions" id="reactions-${escapeHtml(log.id)}">
            ${REACTION_EMOJIS.map(e => `
                <button class="reaction-btn" data-emoji="${e}" data-logid="${escapeHtml(log.id)}">
                    <span class="reaction-emoji">${e}</span>
                    <span class="reaction-count">0</span>
                </button>
            `).join("")}
        </div>

        <!-- COMMENTS -->
        <div class="devlog-comments-section">
            <h4 class="devlog-comments-heading">Comments</h4>
            <div class="comments-list" id="comments-list-${escapeHtml(log.id)}">
                <p class="comments-loading">Loading comments...</p>
            </div>
            <form class="comment-form" id="comment-form-${escapeHtml(log.id)}">
                <input
                    type="text"
                    class="comment-input comment-name"
                    placeholder="Your name"
                    maxlength="40"
                    value="${escapeHtml(getSavedName())}"
                    required
                >
                <textarea
                    class="comment-input comment-message"
                    placeholder="Leave a comment..."
                    maxlength="500"
                    rows="3"
                    required
                ></textarea>
                <div class="comment-form-footer">
                    <span class="comment-error" id="comment-error-${escapeHtml(log.id)}"></span>
                    <button type="submit" class="btn-comment-submit">Post Comment</button>
                </div>
            </form>
        </div>
    `;

    modal.style.display = "flex";

    // ── Wire reactions ──
    const unsubReactions = listenReactions(log.id, (counts) => {
        const userReacted = getUserReactions(log.id);
        REACTION_EMOJIS.forEach(emoji => {
            const btn = body.querySelector(`.reaction-btn[data-emoji="${emoji}"]`);
            if (!btn) return;
            btn.querySelector(".reaction-count").textContent = counts[emoji] || 0;
            btn.classList.toggle("reacted", userReacted.includes(emoji));
        });
    });
    activeListeners.push(unsubReactions);

    body.querySelectorAll(".reaction-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const emoji = btn.dataset.emoji;
            const logId = btn.dataset.logid;
            btn.disabled = true;
            try {
                await toggleReaction(logId, emoji);
            } catch (e) {
                console.error(e);
            } finally {
                btn.disabled = false;
            }
        });
    });

    // ── Wire comments ──
    const listEl = body.querySelector(`#comments-list-${log.id}`);
    const unsubComments = listenComments(log.id, (comments) => {
        if (comments.length === 0) {
            listEl.innerHTML = `<p class="comments-empty">No comments yet. Be the first!</p>`;
            return;
        }
        listEl.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-meta">
                    <span class="comment-author">${escapeHtml(c.name)}</span>
                    <span class="comment-time">${c.timestamp ? formatTimestamp(c.timestamp) : "just now"}</span>
                </div>
                <p class="comment-text">${escapeHtml(c.message)}</p>
            </div>
        `).join("");
        // Auto-scroll to latest
        listEl.scrollTop = listEl.scrollHeight;
    });
    activeListeners.push(unsubComments);

    // ── Wire comment form ──
    const form = body.querySelector(`#comment-form-${log.id}`);
    const errorEl = body.querySelector(`#comment-error-${log.id}`);
    const submitBtn = form.querySelector(".btn-comment-submit");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = form.querySelector(".comment-name").value;
        const message = form.querySelector(".comment-message").value;
        errorEl.textContent = "";
        submitBtn.disabled = true;
        submitBtn.textContent = "Posting...";
        try {
            await postComment(log.id, name, message);
            form.querySelector(".comment-message").value = "";
            submitBtn.textContent = "Post Comment";
        } catch (err) {
            errorEl.textContent = err.message;
            submitBtn.textContent = "Post Comment";
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// ─── TAB SWITCHING ────────────────────────────────────────────
function initNewsTabs() {
    const tabs = document.querySelectorAll(".news-tab-btn");
    const panels = document.querySelectorAll(".news-tab-panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            panels.forEach(p => p.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(tab.dataset.panel).classList.add("active");
        });
    });
}

// ─── INIT ─────────────────────────────────────────────────────
async function initDevLogs() {
    initNewsTabs();

    const grid = document.getElementById("devlogGrid");
    const loadingEl = document.getElementById("devlogLoading");
    const errorEl = document.getElementById("devlogError");

    // Modal close handlers
    const modal = document.getElementById("devlogModal");
    modal.querySelector(".devlog-modal-close").addEventListener("click", closeLogModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeLogModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeLogModal();
    });

    // Delegate "Read More" clicks on dynamically rendered cards
    grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-open-log");
        if (!btn) return;
        const logId = btn.dataset.id;
        const log = window._devLogs?.find(l => l.id === logId);
        if (log) openLogModal(log);
    });

    try {
        const logs = await fetchDevLogs();
        window._devLogs = logs; // store for modal lookup

        loadingEl.style.display = "none";

        if (logs.length === 0) {
            errorEl.textContent = "No dev logs yet. Check back soon!";
            errorEl.style.display = "block";
            return;
        }

        logs.forEach(log => {
            grid.appendChild(buildLogCard(log));
        });

    } catch (err) {
        loadingEl.style.display = "none";
        errorEl.textContent = "Couldn't load dev logs. Please try again later.";
        errorEl.style.display = "block";
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", initDevLogs);
