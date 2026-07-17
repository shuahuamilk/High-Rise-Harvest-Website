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

openModalBtn.addEventListener("click", openModal);
navDownloadBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);

window.addEventListener("click", (e) => {
    if (e.target === modal) {
        closeModal();
    }
});


// --- SMOOTH SCROLL ---
function smoothScrollTo(target, duration = 900) {
    const start = window.scrollY;
    const navbarHeight = document.querySelector('.navbar').offsetHeight;
    const end = target.getBoundingClientRect().top + window.scrollY - navbarHeight;
    const distance = end - start;
    let startTime = null;

    function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        window.scrollTo(0, start + distance * easeInOutQuad(progress));
        if (elapsed < duration) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
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
    // Stop YouTube video when leaving trailer slide
    if (currentIndex === 0) {
        const iframe = document.querySelector('.trailer-wrapper iframe');
        const src = iframe.src;
        iframe.src = '';
        iframe.src = src;
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