// Applies the Performance tab settings sitewide (every roblox.com page,
// including Roblox's own animations and page modules, not just RoValra's UI).
import { observeElement } from '../../core/observer.js';
const ANIMATIONS_CLASS = 'rovalra-disable-animations';
const PERFORMANCE_CLASS = 'rovalra-performance-mode';
const BLOAT_CLASS = 'rovalra-remove-bloat';
const MINIMAL_CLASS = 'rovalra-minimal';

const FROZEN_ATTR = 'data-rovalra-perf-frozen';

export const PERFORMANCE_STORAGE_KEYS = {
    performanceMode: 'performanceModeEnabled',
    disableAnimations: 'disableAnimationsEnabled',
    removeBloat: 'removeBloatEnabled',
    minimalDesign: 'minimalDesignEnabled',
};

export async function getPerformanceState() {
    try {
        const stored = await chrome.storage.local.get({
            [PERFORMANCE_STORAGE_KEYS.performanceMode]: false,
            [PERFORMANCE_STORAGE_KEYS.disableAnimations]: false,
            [PERFORMANCE_STORAGE_KEYS.removeBloat]: false,
            [PERFORMANCE_STORAGE_KEYS.minimalDesign]: false,
        });
        const performanceMode =
            stored[PERFORMANCE_STORAGE_KEYS.performanceMode] === true;
        const disableAnimations =
            stored[PERFORMANCE_STORAGE_KEYS.disableAnimations] === true;
        const removeBloat =
            stored[PERFORMANCE_STORAGE_KEYS.removeBloat] === true;
        // Minimalist Design is an independent look, never forced by
        // Performance Mode.
        const minimalDesign =
            stored[PERFORMANCE_STORAGE_KEYS.minimalDesign] === true;
        return {
            performanceMode,
            disableAnimations,
            removeBloat,
            minimalDesign,
            // Performance mode bundles every performance option, so it
            // forces animations off, bloat removal on, while enabled.
            animationsOff: performanceMode || disableAnimations,
            bloatRemoved: performanceMode || removeBloat,
        };
    } catch (error) {
        console.warn('RoValra: Failed to read performance settings', error);
        return {
            performanceMode: false,
            disableAnimations: false,
            removeBloat: false,
            minimalDesign: false,
            animationsOff: false,
            bloatRemoved: false,
        };
    }
}

function isGifSource(src) {
    return typeof src === 'string' && /\.gif([?#]|$)/i.test(src);
}

function pauseVideos(root) {
    const videos = [];
    if (root instanceof HTMLVideoElement) videos.push(root);
    if (root && typeof root.querySelectorAll === 'function') {
        videos.push(...root.querySelectorAll('video'));
    }
    videos.forEach((video) => {
        try {
            if (video.autoplay) video.removeAttribute('autoplay');
            if (!video.paused) video.pause();
        } catch {
            // A video that refuses to pause is left playing.
        }
    });
}

function pauseSvgAnimations(root) {
    const svgs = [];
    if (root instanceof SVGSVGElement) svgs.push(root);
    if (root && typeof root.querySelectorAll === 'function') {
        svgs.push(...root.querySelectorAll('svg'));
    }
    svgs.forEach((svg) => {
        try {
            if (typeof svg.pauseAnimations === 'function') {
                svg.pauseAnimations();
            }
        } catch {
            // Non-SMIL SVGs have nothing to pause.
        }
    });
}

function unpauseSvgAnimations() {
    Array.from(document.querySelectorAll('svg')).forEach((svg) => {
        try {
            if (typeof svg.unpauseAnimations === 'function') {
                svg.unpauseAnimations();
            }
        } catch {
            // Leave the SVG as-is.
        }
    });
}

async function freezeGifImage(image) {
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.rovalraPerfFrozen || image.dataset.rovalraPerfChecked) {
        return;
    }
    const src = image.currentSrc || image.src;
    if (!isGifSource(src)) return;
    image.dataset.rovalraPerfChecked = 'true';

    try {
        // Reading raw image bytes to detect animation is not a Roblox API
        // call, so the API helpers do not apply here.
        const response = await fetch(src); // Verified
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        // Animated GIFs carry more than one Graphic Control Extension block.
        let controlBlockCount = 0;
        for (
            let i = 0;
            i + 1 < bytes.length && controlBlockCount < 2;
            i++
        ) {
            if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
                controlBlockCount++;
            }
        }
        if (controlBlockCount < 2) return;
        if (!image.isConnected) return;
        if (typeof image.decode === 'function') {
            await image.decode().catch(() => {});
            if (!image.isConnected) return;
        }

        const width = image.naturalWidth || image.clientWidth;
        const height = image.naturalHeight || image.clientHeight;
        if (!width || !height) return;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, width, height);

        // Keep the page layout identical to the original image.
        canvas.className = image.className;
        const rect = image.getBoundingClientRect();
        if (rect.width > 0) canvas.style.width = `${rect.width}px`;
        if (rect.height > 0) canvas.style.height = `${rect.height}px`;
        canvas.setAttribute('role', 'img');
        const alt = image.getAttribute('alt');
        if (alt !== null) canvas.setAttribute('aria-label', alt);

        canvas.dataset.rovalraPerfFrozen = 'true';
        canvas.dataset.rovalraPerfSrc = src;
        image.replaceWith(canvas);
    } catch {
        // Tainted/unreadable images are left animating.
    }
}

function restoreFrozenGifs() {
    Array.from(
        document.querySelectorAll(`canvas[${FROZEN_ATTR}]`),
    ).forEach((canvas) => {
        try {
            const src = canvas.dataset.rovalraPerfSrc;
            if (!src) return;
            const image = document.createElement('img');
            image.src = src;
            image.className = canvas.className;
            const alt = canvas.getAttribute('aria-label');
            if (alt !== null) image.setAttribute('alt', alt);
            canvas.replaceWith(image);
        } catch {
            // Leave the frozen frame in place.
        }
    });
}

function freezeGifCandidates(root) {
    const images = [];
    if (root instanceof HTMLImageElement) images.push(root);
    if (root && typeof root.querySelectorAll === 'function') {
        images.push(...root.querySelectorAll('img'));
    }
    images.forEach((image) => {
        if (isGifSource(image.currentSrc || image.src)) {
            freezeGifImage(image);
        }
    });
}

function sweepAnimatedMedia() {
    pauseVideos(document);
    pauseSvgAnimations(document);
    freezeGifCandidates(document);
}

let animationWatchers = [];

function stopAnimatedMediaWatch() {
    animationWatchers.forEach((watcher) => {
        try {
            watcher?.disconnect();
        } catch {
            // Already disconnected.
        }
    });
    animationWatchers = [];
}

function watchAnimatedMedia() {
    stopAnimatedMediaWatch();
    sweepAnimatedMedia();
    animationWatchers = [
        observeElement('video', (video) => pauseVideos(video), {
            multiple: true,
        }),
        observeElement('svg', (svg) => pauseSvgAnimations(svg), {
            multiple: true,
        }),
        observeElement(
            'img',
            (image) => {
                if (isGifSource(image.currentSrc || image.src)) {
                    freezeGifImage(image);
                }
            },
            { multiple: true },
        ),
    ];
}

function setAnimationsWatching(enabled) {
    const watching = animationWatchers.length > 0;
    if (enabled && !watching) {
        watchAnimatedMedia();
    } else if (!enabled && watching) {
        stopAnimatedMediaWatch();
        unpauseSvgAnimations();
        restoreFrozenGifs();
    }
}

function applyPerformanceState(state) {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle(ANIMATIONS_CLASS, state.animationsOff === true);
    root.classList.toggle(BLOAT_CLASS, state.bloatRemoved === true);
    root.classList.toggle(MINIMAL_CLASS, state.minimalDesign === true);
    root.classList.toggle(PERFORMANCE_CLASS, state.performanceMode === true);
    setAnimationsWatching(state.animationsOff === true);
}

async function refreshPerformanceState() {
    applyPerformanceState(await getPerformanceState());
}

export async function init() {
    await refreshPerformanceState();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (
            changes[PERFORMANCE_STORAGE_KEYS.performanceMode] ||
            changes[PERFORMANCE_STORAGE_KEYS.disableAnimations] ||
            changes[PERFORMANCE_STORAGE_KEYS.removeBloat] ||
            changes[PERFORMANCE_STORAGE_KEYS.minimalDesign]
        ) {
            refreshPerformanceState();
        }
    });
}
