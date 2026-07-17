// ============================================================
//  moderation.js — Shared profanity / sensitive-topic filtering
//  Used by both the Player Feedback form and Dev Log comments.
//  Must load BEFORE firebase.js, devlogs.js, and feedback.js.
// ============================================================

// Tier 1: hard-blocked terms — submission is rejected outright.
// Populated from assets/blocklist.json (English + Filipino dictionaries).
// If the fetch fails, this tier is simply skipped — Tier 2 still works.
let BLOCK_TERMS = [];

// Tier 2: milder words auto-censored (***) but still allowed through.
const CENSOR_TERMS = ["stupid", "idiot", "dumb", "crap"];

// Sensitive-topic terms — not blocked, just flagged for priority manual
// review. Populate based on your own moderation policy.
const SENSITIVE_FLAG_TERMS = [];

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadBlockTerms() {
    try {
        const res = await fetch("assets/blocklist.json");
        if (res.ok) {
            BLOCK_TERMS = await res.json();
        }
    } catch {
        // Blocklist unavailable — Tier 1 filtering skipped silently
    }
}
function normalizeForFilter(text) {
    return text
        .toLowerCase()
        .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
        .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
        .replace(/@/g, "a")
        .replace(/[^a-z\s]/g, "")
        .replace(/\s+/g, " ");
}

function matchesAny(normalized, terms) {
    return terms.some(term => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalized));
}

function censorProfanity(message) {
    let result = message;
    let wasCensored = false;
    CENSOR_TERMS.forEach(term => {
        const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
        if (re.test(result)) {
            wasCensored = true;
            result = result.replace(re, match => match[0] + "*".repeat(match.length - 1));
        }
    });
    return { result, wasCensored };
}

function moderateMessage(rawMessage) {
    const normalized = normalizeForFilter(rawMessage);

    if (matchesAny(normalized, BLOCK_TERMS)) {
        return { allowed: false, reason: "Your message contains language that isn't allowed. Please revise and resubmit." };
    }

    const flagged = matchesAny(normalized, SENSITIVE_FLAG_TERMS);
    const { result, wasCensored } = censorProfanity(rawMessage);

    return { allowed: true, message: result, autoModerated: wasCensored, flagged };
}

// Load the blocklist as soon as this file runs, so it's ready before
// either form can be submitted.
loadBlockTerms();