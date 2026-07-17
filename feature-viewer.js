/**
 * feature-viewer.js
 * Interactive 3D viewer for Game Feature cards using Three.js.
 * Loaded as an ES module via importmap in index.html.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const IDLE_ROTATION_SPEED  = 0.008;   // radians per frame
const HOVER_BOB_AMPLITUDE  = 0.12;    // world units
const HOVER_BOB_FREQUENCY  = 1.8;     // Hz
const LERP_FACTOR          = 0.06;    // camera reset smoothing (0–1)
const RESET_THRESHOLD      = 0.001;   // stop lerping when close enough
const CANVAS_HEIGHT        = 120;     // px — matches CSS .feature-icon height

// Default camera position (pulled back enough to frame most models)
const DEFAULT_CAM_POS = new THREE.Vector3(0, 0.1, 2);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 0);

// ─── Shared animation loop ────────────────────────────────────────────────────
const viewers = [];
let rafId = null;

function startLoop() {
    if (rafId !== null) return;
    function loop() {
        rafId = requestAnimationFrame(loop);
        const t = performance.now() * 0.001; // seconds
        for (const v of viewers) v.tick(t);
    }
    loop();
}

// ─── FeatureViewer class ──────────────────────────────────────────────────────
class FeatureViewer {
    /**
     * @param {HTMLElement} iconEl   - The .feature-icon div
     * @param {string}      glbPath  - Path to .glb file, or '' for fallback
     */
    constructor(iconEl, glbPath) {
        this.iconEl  = iconEl;
        this.glbPath = glbPath;
        this.state   = 'idle'; // idle | hover | clicked | resetting

        this._buildDOM();
        this._buildScene();
        this._loadModel();
        this._bindEvents();

        viewers.push(this);
        startLoop();
    }

    // ── DOM ──────────────────────────────────────────────────────────────────
    _buildDOM() {
        // Clear existing icon content (PNG img or emoji text)
        this.iconEl.innerHTML = '';
        this.iconEl.style.position = 'relative';

        // Loading spinner
        this.spinner = document.createElement('div');
        this.spinner.className = 'feature-viewer-loading';
        this.spinner.textContent = '⟳';
        this.iconEl.appendChild(this.spinner);

        // Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'feature-viewer-canvas';
        this.canvas.style.display = 'none'; // shown after model loads
        this.iconEl.appendChild(this.canvas);

        // Reset button (reload icon)
        this.resetBtn = document.createElement('button');
        this.resetBtn.className = 'feature-viewer-reset';
        this.resetBtn.setAttribute('aria-label', 'Reset view');
        const reloadImg = document.createElement('img');
        reloadImg.src = 'assets/icons/reload.png';
        reloadImg.alt = '';
        reloadImg.setAttribute('aria-hidden', 'true');
        this.resetBtn.appendChild(reloadImg);
        this.iconEl.appendChild(this.resetBtn);
    }

    // ── Three.js scene ────────────────────────────────────────────────────────
    _buildScene() {
        const w = this.iconEl.clientWidth || 260;
        const h = CANVAS_HEIGHT;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,          // transparent background
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
        this.camera.position.copy(DEFAULT_CAM_POS);
        this.camera.lookAt(DEFAULT_CAM_TARGET);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambient);

        const key = new THREE.DirectionalLight(0xffffff, 2.0);
        key.position.set(3, 5, 3);
        this.scene.add(key);

        const fill = new THREE.DirectionalLight(0xa3e2c9, 0.6);
        fill.position.set(-3, 2, -2);
        this.scene.add(fill);

        // OrbitControls (disabled by default)
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enabled = false;

        // Model pivot (we rotate this, not the raw model)
        this.pivot = new THREE.Group();
        this.scene.add(this.pivot);

        // Resize observer
        this._ro = new ResizeObserver(() => this._onResize());
        this._ro.observe(this.iconEl);
    }

    _onResize() {
        const w = this.iconEl.clientWidth || 260;
        const h = CANVAS_HEIGHT;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    // ── Model loading ─────────────────────────────────────────────────────────
    _loadModel() {
        if (this.glbPath) {
            const loader = new GLTFLoader();
            loader.load(
                this.glbPath,
                (gltf) => this._onModelLoaded(gltf.scene),
                undefined,
                (err) => {
                    console.warn(`[FeatureViewer] Failed to load ${this.glbPath}:`, err);
                    this._useFallback();
                }
            );
        } else {
            this._useFallback();
        }
    }

    _onModelLoaded(modelScene) {
        // Normalise: centre and scale to fit a ~1-unit bounding box
        const box = new THREE.Box3().setFromObject(modelScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.4 / maxDim;
        modelScene.scale.setScalar(scale);

        // Re-centre after scaling
        box.setFromObject(modelScene);
        const centre = new THREE.Vector3();
        box.getCenter(centre);
        modelScene.position.sub(centre);

        this.pivot.add(modelScene);
        this._showCanvas();
    }

    _useFallback() {
        // Pick a distinct color per card index so empty-GLB cards look different
        const FALLBACK_COLORS = [
            { solid: 0x2e4a3f, wire: 0xa3e2c9 }, // green + mint (default)
            { solid: 0x4a3f2e, wire: 0xe2c9a3 }, // brown + wheat
            { solid: 0x2e3f4a, wire: 0xa3c9e2 }, // navy + sky
            { solid: 0x4a2e3f, wire: 0xe2a3c9 }, // plum + pink
            { solid: 0x3f4a2e, wire: 0xc9e2a3 }, // olive + lime
            { solid: 0x3f2e4a, wire: 0xc9a3e2 }, // purple + lavender
        ];

        // Use the card's position in the DOM rather than the viewers array,
        // because viewers.indexOf(this) returns -1 when called during construction
        // (the viewer hasn't been pushed yet at the time _useFallback runs).
        const allCards = Array.from(document.querySelectorAll('.feature-card[data-glb]'));
        const myCard   = this.iconEl.closest('.feature-card');
        const idx      = myCard ? allCards.indexOf(myCard) : 0;
        const palette  = FALLBACK_COLORS[Math.max(0, idx) % FALLBACK_COLORS.length];

        const geo  = new THREE.IcosahedronGeometry(0.7, 1);
        const mat  = new THREE.MeshStandardMaterial({
            color: palette.solid,
            roughness: 0.4,
            metalness: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);

        const wireMat  = new THREE.MeshBasicMaterial({ color: palette.wire, wireframe: true });
        const wireMesh = new THREE.Mesh(geo, wireMat);
        mesh.add(wireMesh);

        this.pivot.add(mesh);
        this._showCanvas();
    }

    _showCanvas() {
        this.spinner.style.display = 'none';
        this.canvas.style.display  = 'block';
    }

    // ── Events ────────────────────────────────────────────────────────────────
    _bindEvents() {
        const card = this.iconEl.closest('.feature-card');

        // Hover
        card.addEventListener('mouseenter', () => {
            if (this.state !== 'clicked') this._setState('hover');
        });
        card.addEventListener('mouseleave', () => {
            if (this.state === 'hover') this._setState('idle');
        });

        // Click on canvas → enter free-rotate mode
        this.canvas.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.state !== 'clicked') this._setState('clicked');
        });

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (this.state !== 'clicked') this._setState('clicked');
        }, { passive: true });

        // Reset button
        this.resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._setState('resetting');
        });

        // Click outside card → reset if clicked
        document.addEventListener('click', (e) => {
            if (this.state === 'clicked' && !card.contains(e.target)) {
                this._setState('resetting');
            }
        });
    }

    _setState(newState) {
        this.state = newState;

        const card = this.iconEl.closest('.feature-card');

        switch (newState) {
            case 'idle':
                this.controls.enabled = false;
                this.canvas.classList.remove('is-clicked');
                this.resetBtn.classList.remove('visible');
                card.classList.remove('is-viewer-active');
                break;

            case 'hover':
                this.controls.enabled = false;
                this.canvas.classList.remove('is-clicked');
                this.resetBtn.classList.remove('visible');
                card.classList.remove('is-viewer-active');
                break;

            case 'clicked':
                this.controls.enabled = true;
                this.controls.target.copy(DEFAULT_CAM_TARGET);
                this.controls.update();
                this.canvas.classList.add('is-clicked');
                this.resetBtn.classList.add('visible');
                card.classList.add('is-viewer-active');
                break;

            case 'resetting':
                this.controls.enabled = false;
                this.canvas.classList.remove('is-clicked');
                this.resetBtn.classList.remove('visible');
                card.classList.remove('is-viewer-active');
                // Store start position for lerp
                this._resetStartPos = this.camera.position.clone();
                break;
        }
    }

    // ── Animation tick ────────────────────────────────────────────────────────
    tick(t) {
        if (!this.pivot) return;

        switch (this.state) {
            case 'idle':
                this.pivot.rotation.y += IDLE_ROTATION_SPEED;
                this.pivot.position.y  = 0;
                break;

            case 'hover': {
                this.pivot.rotation.y += IDLE_ROTATION_SPEED;
                const bob = Math.sin(t * HOVER_BOB_FREQUENCY * Math.PI * 2) * HOVER_BOB_AMPLITUDE;
                this.pivot.position.y = bob;
                break;
            }

            case 'clicked':
                this.controls.update();
                break;

            case 'resetting': {
                // Lerp camera back to default
                this.camera.position.lerp(DEFAULT_CAM_POS, LERP_FACTOR);
                this.controls.target.lerp(DEFAULT_CAM_TARGET, LERP_FACTOR);
                this.controls.update();

                // Also ease pivot rotation back to 0 on X and Z
                this.pivot.rotation.x = THREE.MathUtils.lerp(this.pivot.rotation.x, 0, LERP_FACTOR);
                this.pivot.rotation.z = THREE.MathUtils.lerp(this.pivot.rotation.z, 0, LERP_FACTOR);

                const distCam = this.camera.position.distanceTo(DEFAULT_CAM_POS);
                if (distCam < RESET_THRESHOLD) {
                    this.camera.position.copy(DEFAULT_CAM_POS);
                    this.controls.target.copy(DEFAULT_CAM_TARGET);
                    this._setState('idle');
                } else {
                    // Keep slow Y rotation during reset for visual continuity
                    this.pivot.rotation.y += IDLE_ROTATION_SPEED * 0.5;
                }
                break;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// ─── Initialise all feature cards ────────────────────────────────────────────
function initFeatureViewers() {
    const cards = document.querySelectorAll('.feature-card[data-glb]');
    cards.forEach(card => {
        const iconEl = card.querySelector('.feature-icon');
        if (!iconEl) return;
        const glbPath = card.dataset.glb || '';
        new FeatureViewer(iconEl, glbPath);
    });
}

// Wait for DOM + a short delay so card widths are computed
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initFeatureViewers, 100));
} else {
    setTimeout(initFeatureViewers, 100);
}
