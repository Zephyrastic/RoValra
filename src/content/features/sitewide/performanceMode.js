// Applies the Performance tab settings sitewide (every roblox.com page,
// including Roblox's own animations, not just RoValra's UI).
const ANIMATIONS_CLASS = 'rovalra-disable-animations';
const PERFORMANCE_CLASS = 'rovalra-performance-mode';

export const PERFORMANCE_STORAGE_KEYS = {
    performanceMode: 'performanceModeEnabled',
    disableAnimations: 'disableAnimationsEnabled',
};

export async function getPerformanceState() {
    try {
        const stored = await chrome.storage.local.get({
            [PERFORMANCE_STORAGE_KEYS.performanceMode]: false,
            [PERFORMANCE_STORAGE_KEYS.disableAnimations]: false,
        });
        const performanceMode =
            stored[PERFORMANCE_STORAGE_KEYS.performanceMode] === true;
        const disableAnimations =
            stored[PERFORMANCE_STORAGE_KEYS.disableAnimations] === true;
        return {
            performanceMode,
            disableAnimations,
            // Performance mode bundles every performance option, so it
            // forces animations off while enabled.
            animationsOff: performanceMode || disableAnimations,
        };
    } catch (error) {
        console.warn('RoValra: Failed to read performance settings', error);
        return {
            performanceMode: false,
            disableAnimations: false,
            animationsOff: false,
        };
    }
}

function applyPerformanceState(state) {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle(ANIMATIONS_CLASS, state.animationsOff === true);
    root.classList.toggle(PERFORMANCE_CLASS, state.performanceMode === true);
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
            changes[PERFORMANCE_STORAGE_KEYS.disableAnimations]
        ) {
            refreshPerformanceState();
        }
    });
}
