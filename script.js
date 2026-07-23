// --- PAGE LOADER ---
window.addEventListener('load', () => {
    const loader = document.getElementById('pageLoader');
    // Give the fill animation time to complete (1.3s) before hiding
    setTimeout(() => {
        loader.classList.add('hidden');
    }, 1450);
});


// --- HERO VIDEO FADE-IN ---
const heroVideo = document.querySelector('.hero-video');
if (heroVideo) {
    heroVideo.style.opacity = '0';
    heroVideo.style.transition = 'opacity 1s ease';
    heroVideo.addEventListener('canplay', () => {
        heroVideo.style.opacity = '1';
    });
    // Fallback: show video even if canplay fires late
    setTimeout(() => { heroVideo.style.opacity = '1'; }, 2000);

    // Log real load failures (404, bad codec, etc.) instead of failing silently
    heroVideo.addEventListener('error', () => {
        console.warn('[hero-video] Failed to load:', heroVideo.currentSrc || heroVideo.src);
    });

    // Some browsers/devices block autoplay even with muted+playsinline
    // (in-app browsers, battery saver, data saver). Retry on the user's
    // first interaction so it isn't stuck on the poster indefinitely.
    const heroPlayPromise = heroVideo.play();
    if (heroPlayPromise !== undefined) {
        heroPlayPromise.catch(() => {
            const resumeHeroVideo = () => {
                heroVideo.play().catch(() => { /* still blocked, poster stays visible */ });
                document.removeEventListener('click', resumeHeroVideo);
                document.removeEventListener('touchstart', resumeHeroVideo);
                document.removeEventListener('keydown', resumeHeroVideo);
            };
            document.addEventListener('click', resumeHeroVideo, { once: true });
            document.addEventListener('touchstart', resumeHeroVideo, { once: true });
            document.addEventListener('keydown', resumeHeroVideo, { once: true });
        });
    }
}


// --- SCROLL TO TOP BUTTON ---
const scrollToTopBtn = document.getElementById('scrollToTop');

window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
});

scrollToTopBtn.addEventListener('click', () => {
    smoothScrollTo(document.body);
});


// --- HAMBURGER MENU ---
const hamburger = document.getElementById('hamburger');
const navLinksMenu = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinksMenu.classList.toggle('open');
});

// Close menu when a nav link is clicked
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinksMenu.classList.remove('open');
    });
});


// --- MODAL FUNCTIONALITY ---
const modal = document.getElementById("downloadModal");
const openModalBtn = document.querySelector(".open-modal");
const closeModalBtn = document.querySelector(".close-btn");
const navDownloadBtn = document.querySelector(".btn-download-nav");

function openModal(e) {
    e.preventDefault();
    modal.style.display = "flex";
}

function closeModal() {
    modal.style.display = "none";
}

if (openModalBtn) openModalBtn.addEventListener("click", openModal);
if (navDownloadBtn) navDownloadBtn.addEventListener("click", openModal);
if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);

window.addEventListener("click", (e) => {
    if (modal && e.target === modal) {
        closeModal();
    }
});


// --- SMOOTH SCROLL ---
let _smoothScrollFrame = null;
let _smoothScrollStop = null;

function smoothScrollTo(target, duration = 900) {
    // Cancel any animation already in flight so rapid Next/Prev clicks
    // don't stack multiple rAF loops fighting over window.scrollTo().
    if (_smoothScrollStop) _smoothScrollStop();

    const start = window.scrollY;
    const navbarHeight = document.querySelector('.navbar').offsetHeight;
    const end = target.getBoundingClientRect().top + window.scrollY - navbarHeight;
    const distance = end - start;

    // Already basically there — don't bother animating a few px,
    // which is what was reading as an unwanted auto-scroll.
    if (Math.abs(distance) < 4) return;

    let startTime = null;
    let cancelled = false;

    function stop() {
        cancelled = true;
        if (_smoothScrollFrame) cancelAnimationFrame(_smoothScrollFrame);
        _smoothScrollFrame = null;
        document.removeEventListener('wheel', stop);
        document.removeEventListener('touchstart', stop);
        document.removeEventListener('keydown', stop);
        _smoothScrollStop = null;
    }
    _smoothScrollStop = stop;

    // Let go the instant the user tries to take back control of scrolling.
    document.addEventListener('wheel', stop, { passive: true });
    document.addEventListener('touchstart', stop, { passive: true });
    document.addEventListener('keydown', stop);

    function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function animate(currentTime) {
        if (cancelled) return;
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        window.scrollTo(0, start + distance * easeInOutQuad(progress));
        if (elapsed < duration) {
            _smoothScrollFrame = requestAnimationFrame(animate);
        } else {
            stop();
        }
    }

    _smoothScrollFrame = requestAnimationFrame(animate);
}

document.querySelectorAll('.nav-links a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        if (this.classList.contains('btn-download-nav')) return;
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) smoothScrollTo(target);
    });
});

// Logo scrolls to top
document.querySelector('.logo a').addEventListener('click', function(e) {
    e.preventDefault();
    smoothScrollTo(document.body);
});

// --- MEDIA CAROUSEL ---
const track = document.querySelector('.carousel-track');
const slides = document.querySelectorAll('.carousel-slide');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const dotsContainer = document.getElementById('carouselDots');

let currentIndex = 0;

// --- TRAILER FACADE (lazy-load the YouTube iframe on tap) ---
// The trailer slide starts as a plain <img> + <button> — both normal
// elements that swipe normally. The real (cross-origin) iframe only
// gets created once the user explicitly taps play, since a loaded
// YouTube iframe swallows touch events meant for the carousel.
const trailerWrapper = document.querySelector('.trailer-wrapper');
if (trailerWrapper) {
    const playBtn = trailerWrapper.querySelector('.trailer-play-btn');
    playBtn.addEventListener('click', () => {
        const videoId = trailerWrapper.dataset.videoId;
        trailerWrapper.innerHTML = `
            <iframe
                src="https://www.youtube.com/embed/${videoId}?rel=0&enablejsapi=1&autoplay=1"
                title="High-Rise Harvest Official Trailer"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen>
            </iframe>
        `;
    });
}

// --- CAROUSEL SWIPE GESTURES ---
const carouselEl = document.querySelector('.carousel');

let touchStartX = 0;
let touchEndX = 0;

carouselEl.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

carouselEl.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    const swipeThreshold = 50; // Minimum px distance to count as a swipe
    const diff = touchStartX - touchEndX;

    if (diff > swipeThreshold) {
        nextSlide(); // Swiped left — go next
    } else if (diff < -swipeThreshold) {
        prevSlide(); // Swiped right — go prev
    }
}

// Build dots
slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.classList.add('carousel-dot');
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
});

function updateDots() {
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
    });
}

function goToSlide(index) {
    // Pause the YouTube video via postMessage when leaving the trailer slide.
    // send a pause command instead of resetting the src, so the player stays loaded and returns instantly when the user navigates back
    if (currentIndex === 0 && index !== 0) {
        const iframe = document.querySelector('.trailer-wrapper iframe');
        if (iframe) {
            iframe.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
                '*'
            );
        }
    }
    currentIndex = index;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    updateDots();
}

function nextSlide() {
    const next = (currentIndex + 1) % slides.length;
    goToSlide(next);
}

function prevSlide() {
    const prev = (currentIndex - 1 + slides.length) % slides.length;
    goToSlide(prev);
}

prevBtn.addEventListener('click', () => prevSlide());
nextBtn.addEventListener('click', () => nextSlide());

// --- SCROLLSPY INTERSECTION OBSERVER ---
const sections = document.querySelectorAll(".target-section");
const navItems = document.querySelectorAll(".nav-links a");

const observerOptions = {
    root: null,
    rootMargin: "-20% 0px -60% 0px",
    threshold: 0
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.getAttribute("id");
            navItems.forEach(item => {
                item.classList.remove("active");
                if (item.getAttribute("href") === `#${id}`) {
                    item.classList.add("active");
                }
            });
        }
    });
}, observerOptions);

sections.forEach(section => {
    observer.observe(section);
});

// --- THEME SWITCHER (single icon, cycles Light -> Dark -> System) ---
(function() {
    'use strict';

    const THEME_ORDER  = ['light', 'dark', 'system'];
    const THEME_ICONS  = {
        light:  'assets/icons/light-mode.png',
        dark:   'assets/icons/dark-mode.png',
        system: 'assets/icons/system-mode.png'
    };
    const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'System' };

    const toggleBtn = document.getElementById('themeToggle');
    const iconEl = toggleBtn ? toggleBtn.querySelector('.theme-toggle-icon') : null;

    let currentTheme = localStorage.getItem('theme') || 'system';

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;

        document.documentElement.setAttribute('data-theme', effectiveTheme);
        localStorage.setItem('theme', theme);
        currentTheme = theme;

        updateToggleUI(theme);
    }

    function updateToggleUI(theme) {
        if (!toggleBtn) return;
        if (iconEl) {
            iconEl.src = THEME_ICONS[theme];
            iconEl.alt = `${THEME_LABELS[theme]} theme`;
        }
        toggleBtn.title = `Theme: ${THEME_LABELS[theme]}`;
        toggleBtn.setAttribute('aria-label', `Theme: ${THEME_LABELS[theme]}. Click to switch theme.`);
    }

    function cycleTheme() {
        const nextIndex = (THEME_ORDER.indexOf(currentTheme) + 1) % THEME_ORDER.length;
        applyTheme(THEME_ORDER[nextIndex]);
    }

    function watchSystemTheme() {
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemChange = (e) => {
            // Only repaints colors if the user's chosen MODE is still "system" —
            // this never touches the icon, only the resolved light/dark colors.
            if (currentTheme === 'system') {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        };
        if (darkModeMediaQuery.addEventListener) {
            darkModeMediaQuery.addEventListener('change', handleSystemChange);
        } else {
            darkModeMediaQuery.addListener(handleSystemChange);
        }
    }

    function initThemeSwitcher() {
        applyTheme(currentTheme);
        if (toggleBtn) toggleBtn.addEventListener('click', cycleTheme);
        watchSystemTheme();
    }

    initThemeSwitcher();

})();
