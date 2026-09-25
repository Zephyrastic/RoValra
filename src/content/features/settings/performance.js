import { ts } from '../../core/locale/i18n.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import {
    PERFORMANCE_STORAGE_KEYS,
    getPerformanceState,
} from '../sitewide/performanceMode.js';

const ui = (key, options) => ts(`settings.ui.performance.${key}`, options);

function createOptionRow({ titleText, descriptionText, checked, onChange }) {
    const row = document.createElement('div');
    row.className = 'rovalra-perf-row';

    const info = document.createElement('div');
    info.className = 'rovalra-perf-info';

    const title = document.createElement('div');
    title.className = 'rovalra-perf-title';
    title.textContent = titleText;

    const description = document.createElement('div');
    description.className = 'rovalra-perf-description';
    description.textContent = descriptionText;

    info.append(title, description);

    const toggle = createToggle({ checked, onChange });
    row.append(info, toggle);
    return { row, toggle, description };
}

export async function renderPerformance(container) {
    container.innerHTML = '';

    const status = document.createElement('div');
    status.className = 'rovalra-changelog-status';
    status.textContent = ui('loading');
    container.appendChild(status);

    let state;
    try {
        state = await getPerformanceState();
    } catch (error) {
        console.warn('RoValra: Failed to load performance settings', error);
        status.textContent = ui('loadFailed');
        return;
    }

    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'rovalra-perf-card';

    const intro = document.createElement('p');
    intro.className = 'rovalra-perf-description';
    intro.textContent = ui('description');
    card.appendChild(intro);

    let animationsToggle = null;
    let animationsHint = null;
    let rendererToggle = null;
    let rendererHint = null;
    let bloatToggle = null;
    let bloatHint = null;

    const syncAnimationsRow = (nextState) => {
        if (
            animationsToggle &&
            typeof animationsToggle.setChecked === 'function'
        ) {
            animationsToggle.setChecked(nextState.animationsOff === true);
            animationsToggle.disabled = nextState.performanceMode === true;
            animationsToggle.title =
                nextState.performanceMode === true
                    ? ui('animationsForced')
                    : '';
        }
        if (animationsHint) {
            animationsHint.hidden = nextState.performanceMode !== true;
        }
    };

    const syncRendererRow = async () => {
        let rendererEnabled = false;
        try {
            const stored = await chrome.storage.local.get({
                profile3DRenderEnabled: false,
            });
            rendererEnabled = stored.profile3DRenderEnabled === true;
        } catch (error) {
            console.warn(
                'RoValra: Failed to read the 3D renderer setting',
                error,
            );
        }
        const masterOn =
            (await getPerformanceState()).performanceMode === true;
        if (rendererToggle && typeof rendererToggle.setChecked === 'function') {
            rendererToggle.setChecked(rendererEnabled && !masterOn);
            rendererToggle.disabled = masterOn;
            rendererToggle.title = masterOn ? ui('rendererForced') : '';
        }
        if (rendererHint) {
            rendererHint.hidden = !masterOn;
        }
    };

    const syncAllRows = async () => {
        const nextState = await getPerformanceState();
        syncAnimationsRow(nextState);
        await syncRendererRow();
        syncBloatRow(nextState);
    };

    const syncBloatRow = (nextState) => {
        if (bloatToggle && typeof bloatToggle.setChecked === 'function') {
            bloatToggle.setChecked(nextState.bloatRemoved === true);
            bloatToggle.disabled = nextState.performanceMode === true;
            bloatToggle.title =
                nextState.performanceMode === true ? ui('bloatForced') : '';
        }
        if (bloatHint) {
            bloatHint.hidden = nextState.performanceMode !== true;
        }
    };

    const master = createOptionRow({
        titleText: ui('masterTitle'),
        descriptionText: ui('masterDescription'),
        checked: state.performanceMode === true,
        onChange: async (newState) => {
            master.toggle.disabled = true;
            try {
                await chrome.storage.local.set({
                    [PERFORMANCE_STORAGE_KEYS.performanceMode]: newState,
                });
                await syncAllRows();
            } catch (error) {
                console.warn(
                    'RoValra: Failed to save the performance mode setting',
                    error,
                );
                if (typeof master.toggle.setChecked === 'function') {
                    master.toggle.setChecked(!newState);
                }
            } finally {
                master.toggle.disabled = false;
            }
        },
    });
    card.appendChild(master.row);

    const animations = createOptionRow({
        titleText: ui('animationsTitle'),
        descriptionText: ui('animationsDescription'),
        checked: state.animationsOff === true,
        onChange: async (newState) => {
            animations.toggle.disabled = true;
            try {
                await chrome.storage.local.set({
                    [PERFORMANCE_STORAGE_KEYS.disableAnimations]: newState,
                });
            } catch (error) {
                console.warn(
                    'RoValra: Failed to save the disable animations setting',
                    error,
                );
                if (typeof animations.toggle.setChecked === 'function') {
                    animations.toggle.setChecked(!newState);
                }
            } finally {
                syncAnimationsRow(await getPerformanceState());
            }
        },
    });
    animationsToggle = animations.toggle;

    animationsHint = document.createElement('div');
    animationsHint.className = 'rovalra-perf-hint';
    animationsHint.textContent = ui('animationsForced');
    animationsHint.hidden = true;
    animations.description.after(animationsHint);

    syncAnimationsRow(state);
    card.appendChild(animations.row);

    const renderer = createOptionRow({
        titleText: ui('rendererTitle'),
        descriptionText: ui('rendererDescription'),
        checked: false,
        onChange: async (newState) => {
            renderer.toggle.disabled = true;
            try {
                await chrome.storage.local.set({
                    profile3DRenderEnabled: newState,
                });
            } catch (error) {
                console.warn(
                    'RoValra: Failed to save the 3D renderer setting',
                    error,
                );
                if (typeof renderer.toggle.setChecked === 'function') {
                    renderer.toggle.setChecked(!newState);
                }
            } finally {
                await syncRendererRow();
            }
        },
    });
    rendererToggle = renderer.toggle;

    rendererHint = document.createElement('div');
    rendererHint.className = 'rovalra-perf-hint';
    rendererHint.textContent = ui('rendererForced');
    rendererHint.hidden = true;
    renderer.description.after(rendererHint);

    card.appendChild(renderer.row);
    await syncRendererRow();

    const bloat = createOptionRow({
        titleText: ui('bloatTitle'),
        descriptionText: ui('bloatDescription'),
        checked: state.bloatRemoved === true,
        onChange: async (newState) => {
            bloat.toggle.disabled = true;
            try {
                await chrome.storage.local.set({
                    [PERFORMANCE_STORAGE_KEYS.removeBloat]: newState,
                });
            } catch (error) {
                console.warn(
                    'RoValra: Failed to save the remove bloat setting',
                    error,
                );
                if (typeof bloat.toggle.setChecked === 'function') {
                    bloat.toggle.setChecked(!newState);
                }
            } finally {
                syncBloatRow(await getPerformanceState());
            }
        },
    });
    bloatToggle = bloat.toggle;

    bloatHint = document.createElement('div');
    bloatHint.className = 'rovalra-perf-hint';
    bloatHint.textContent = ui('bloatForced');
    bloatHint.hidden = true;
    bloat.description.after(bloatHint);

    card.appendChild(bloat.row);
    syncBloatRow(state);
    container.appendChild(card);
}
