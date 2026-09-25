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
                syncAnimationsRow(await getPerformanceState());
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
    container.appendChild(card);
}
