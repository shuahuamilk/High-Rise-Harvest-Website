// ============================================================
//  music.js — Background music: autoplay, loop, mute, volume
//  Wrapped in an IIFE so nothing leaks into the global scope.
// ============================================================

(function () {
    'use strict';

    const STORAGE_VOLUME_KEY = 'hrh_music_volume';
    const STORAGE_MUTED_KEY  = 'hrh_music_muted';
    const DEFAULT_VOLUME     = 20; // 0-100

    const audio       = document.getElementById('bgMusic');
    const toggleBtn    = document.getElementById('musicToggle');
    const iconEl        = document.getElementById('musicIcon');
    const volumeSlider  = document.getElementById('musicVolumeSlider');
    const controlsWrap  = document.getElementById('musicControls');

    if (!audio || !toggleBtn || !iconEl || !volumeSlider) return;

    // ── Load saved preferences ──
    let currentVolume = parseInt(localStorage.getItem(STORAGE_VOLUME_KEY), 10);
    if (isNaN(currentVolume) || currentVolume < 0 || currentVolume > 100) {
        currentVolume = DEFAULT_VOLUME;
    }
    let isMuted = localStorage.getItem(STORAGE_MUTED_KEY) === 'true';

    audio.volume = currentVolume / 100;
    audio.muted  = isMuted;
    volumeSlider.value = currentVolume;

    // ── Icon states (inline SVG, swapped based on volume/mute) ──
    const ICONS = {
        muted: `<polygon points="4,9 4,15 8,15 13,20 13,4 8,9" fill="currentColor"></polygon><line x1="16" y1="9" x2="22" y2="15"></line><line x1="22" y1="9" x2="16" y2="15"></line>`,
        low:   `<polygon points="4,9 4,15 8,15 13,20 13,4 8,9" fill="currentColor"></polygon><path d="M16 9a5 5 0 0 1 0 6"></path>`,
        high:  `<polygon points="4,9 4,15 8,15 13,20 13,4 8,9" fill="currentColor"></polygon><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19 6a9 9 0 0 1 0 12"></path>`
    };

    function updateUI() {
        const effectiveMuted = isMuted || currentVolume === 0;
        const key = effectiveMuted ? 'muted' : (currentVolume <= 50 ? 'low' : 'high');

        iconEl.innerHTML = ICONS[key];
        toggleBtn.setAttribute('aria-pressed', String(effectiveMuted));
        toggleBtn.title = effectiveMuted ? 'Unmute music' : 'Mute music';
        if (controlsWrap) controlsWrap.classList.toggle('is-muted', effectiveMuted);
    }

    updateUI();

    // ── Mute / unmute toggle & Visibility ──
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (!controlsWrap.classList.contains('slider-visible')) {
            // First click opens the slider & slides button left
            controlsWrap.classList.add('slider-visible');
        } else {
            // Second click toggles mute
            isMuted = !isMuted;
            audio.muted = isMuted;
            localStorage.setItem(STORAGE_MUTED_KEY, String(isMuted));
            
            // Auto-hide the slider if the user chooses to mute
            if (isMuted) {
                controlsWrap.classList.remove('slider-visible');
            }
            
            updateUI();
        }
    });

    // Dismiss slider smoothly when clicking anywhere outside
    document.addEventListener('click', (e) => {
        if (controlsWrap && !controlsWrap.contains(e.target)) {
            controlsWrap.classList.remove('slider-visible');
        }
    });

    // ── Volume slider ──
    volumeSlider.addEventListener('input', () => {
        currentVolume = parseInt(volumeSlider.value, 10);
        audio.volume = currentVolume / 100;
        localStorage.setItem(STORAGE_VOLUME_KEY, String(currentVolume));

        // Dragging volume above 0 implicitly un-mutes
        if (currentVolume > 0 && isMuted) {
            isMuted = false;
            audio.muted = false;
            localStorage.setItem(STORAGE_MUTED_KEY, 'false');
        }
        updateUI();
    });

    // ── Graceful failure if the file is missing/renamed ──
    audio.addEventListener('error', () => {
        console.warn('[music.js] Failed to load background music file:', audio.currentSrc || audio.src);
    });

    // ── Autoplay, with browser-policy fallback ──
    function attemptPlay() {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                // Autoplay was blocked — resume on the very first user interaction
                const resume = () => {
                    audio.play().catch(() => { /* still blocked, give up quietly */ });
                    document.removeEventListener('click', resume);
                    document.removeEventListener('touchstart', resume);
                    document.removeEventListener('keydown', resume);
                };
                document.addEventListener('click', resume, { once: true });
                document.addEventListener('touchstart', resume, { once: true });
                document.addEventListener('keydown', resume, { once: true });
            });
        }
    }

    attemptPlay();
})();