import { observeElement, observeChildren } from '../../core/observer.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { getUserIdFromUrl, getGroupIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApiJson } from '../../core/api.js';
import * as CacheHandler from '../../core/storage/cacheHandler.js';
import { ts } from '../../core/locale/i18n.js';

const joinDateCache = new Map();
const joinDatePromises = new Map();
// Failure timestamps (memory-only). Failures are never written to persistent
// storage: a single bad request must not stick a group on "Unknown" forever.
const joinDateFailures = new Map();
const JOIN_DATE_FAILURE_TTL_MS = 5 * 60 * 1000;
const VIEW_PREFERENCE_KEY = 'rovalra_group_filters_view';
const DEFAULT_VIEW = 'default';

function getStoredViewPreference() {
    return chrome.storage.local
        .get({ [VIEW_PREFERENCE_KEY]: DEFAULT_VIEW })
        .then((settings) =>
            settings[VIEW_PREFERENCE_KEY] === 'grid' ? 'grid' : DEFAULT_VIEW,
        )
        .catch(() => DEFAULT_VIEW);
}

function joinDateCacheKey(groupId, userId) {
    return `${userId}:${groupId}`;
}

export function getCachedJoinDate(groupId, userId) {
    return joinDateCache.get(joinDateCacheKey(groupId, userId)) || null;
}

export async function getJoinDate(groupId, userId) {
    if (!groupId || !userId) return null;
    const key = joinDateCacheKey(groupId, userId);
    if (joinDateCache.has(key)) return joinDateCache.get(key);
    if (joinDatePromises.has(key)) return joinDatePromises.get(key);
    const failedAt = joinDateFailures.get(key);
    if (failedAt && Date.now() - failedAt < JOIN_DATE_FAILURE_TTL_MS) {
        return null;
    }

    const promise = (async () => {
        const cacheKey = `join_date_${userId}_${groupId}`;
        try {
            const cached = await CacheHandler.get(
                'group_filters',
                cacheKey,
                'local',
            );
            if (cached) {
                const date = new Date(cached);
                if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
                    joinDateCache.set(key, date);
                    return date;
                }
                // Drop "unknown" markers persisted by older versions so a
                // previously poisoned entry is retried instead of stuck.
                await CacheHandler.remove(
                    'group_filters',
                    cacheKey,
                    'local',
                );
            }

            const filter = encodeURIComponent(`user == 'users/${userId}'`);
            const res = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/cloud/v2/groups/${groupId}/memberships?filter=${filter}`,
                useApiKey: true,
                useBackground: true,
            });

            const createTime = res?.groupMemberships?.[0]?.createTime;
            if (createTime) {
                const date = new Date(createTime);
                if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
                    CacheHandler.set(
                        'group_filters',
                        cacheKey,
                        createTime,
                        'local',
                    );
                    joinDateCache.set(key, date);
                    return date;
                }
            }
        } catch (e) {
            console.warn(
                `RoValra: Failed to fetch join date for group ${groupId}`,
                e,
            );
        }

        joinDateFailures.set(key, Date.now());
        return null;
    })();

    joinDatePromises.set(key, promise);
    try {
        return await promise;
    } finally {
        joinDatePromises.delete(key);
    }
}

export function init() {
    const userId = getUserIdFromUrl();
    if (!userId) return;

    chrome.storage.local.get({ groupFiltersEnabled: true }, (settings) => {
        if (!settings.groupFiltersEnabled) return;

        observeElement(
            '.profile-communities',
            (container) => {
                const getCarousel = () => {
                    const item = container.querySelector(
                        '#collection-carousel-item, [id="collection-carousel-item"], [class*="-carouselItem"]',
                    );
                    return (
                        item?.parentElement ||
                        container.querySelector(
                            '.css-1i465w8-carousel, [class*="-carousel"]',
                        )
                    );
                };

                const setup = async () => {
                    const carousel = getCarousel();
                    if (!carousel || container.dataset.rovalraFiltersAdded)
                        return;

                    const items = Array.from(
                        carousel.querySelectorAll(
                            '#collection-carousel-item, [id="collection-carousel-item"], [class*="-carouselItem"]',
                        ),
                    );

                    if (items.length === 0) return;

                    container.dataset.rovalraFiltersAdded = 'true';

                    items.forEach((item) => {
                        const link = item.querySelector('a');
                        const groupId = getGroupIdFromUrl(
                            link?.getAttribute('href'),
                        );
                        if (groupId) {
                            getJoinDate(groupId, userId);
                        }
                    });

                    const header = container.querySelector('h2');
                    if (!header) return;

                    const storedView = await getStoredViewPreference();

                    const headerWrapper = document.createElement('div');
                    headerWrapper.style.display = 'flex';
                    headerWrapper.style.alignItems = 'center';
                    headerWrapper.style.justifyContent = 'space-between';
                    headerWrapper.style.width = '100%';
                    headerWrapper.style.marginBottom = '12px';
                    headerWrapper.style.gap = '12px';

                    header.parentNode.insertBefore(headerWrapper, header);
                    headerWrapper.appendChild(header);

                    const originalOrder = [...items];

                    // view options
                    let currentView = storedView;
                    const viewOptions = [
                        { text: 'Row', value: DEFAULT_VIEW },
                        { text: 'Grid', value: 'grid' },
                    ];

                    const applyView = (value, activeCarousel = getCarousel()) => {
                        if (!activeCarousel) return;

                        currentView = value === 'grid' ? 'grid' : DEFAULT_VIEW;
                        const rowButtons =
                            activeCarousel.parentElement?.querySelector(
                                '.scroll-arrow.next',
                            );

                        if (currentView === DEFAULT_VIEW) {
                            activeCarousel.style.display = 'flex';
                            activeCarousel.style.flexWrap = 'nowrap';
                            activeCarousel.style.gridTemplateColumns = '';

                            if (rowButtons) rowButtons.style.display = '';
                        } else {
                            activeCarousel.style.display = 'grid';
                            activeCarousel.style.gridTemplateColumns =
                                'repeat(6, 1fr)';
                            activeCarousel.style.flexWrap = '';

                            if (rowButtons) rowButtons.style.display = 'none';
                        }
                    };

                    const viewToggle = createPillToggle({
                        options: viewOptions,
                        initialValue: storedView,
                        onChange: (value) => {
                            applyView(value);
                            chrome.storage.local
                                .set({ [VIEW_PREFERENCE_KEY]: value })
                                .catch(() => {});
                        },
                    });

                    // filters
                    const sortOptions = [
                        {
                            text: ts('groupFilters.sort.default'),
                            value: 'default',
                        },
                        { text: ts('groupFilters.sort.az'), value: 'az' },
                        { text: ts('groupFilters.sort.za'), value: 'za' },
                        {
                            text: ts('groupFilters.sort.newest'),
                            value: 'newest',
                            tooltip: ts('groupFilters.tooltip'),
                        },
                        {
                            text: ts('groupFilters.sort.oldest'),
                            value: 'oldest',
                            tooltip: ts('groupFilters.tooltip'),
                        },
                    ];

                    const toggle = createPillToggle({
                        options: sortOptions,
                        initialValue: 'default',
                        onChange: async (value) => {
                            const activeCarousel = getCarousel();
                            const rowButtons = document.querySelector('.scroll-arrow.next');
                            if (!activeCarousel) return;

                            const currentItems = Array.from(
                                activeCarousel.querySelectorAll(
                                    '#collection-carousel-item, [id="collection-carousel-item"], [class*="-carouselItem"]',
                                ),
                            );

                            if (value === 'newest' || value === 'oldest') {
                                await Promise.all(
                                    currentItems.map((item) => {
                                        const link = item.querySelector('a');
                                        const groupId = getGroupIdFromUrl(
                                            link?.getAttribute('href'),
                                        );
                                        return getJoinDate(groupId, userId);
                                    }),
                                );
                            }

                            currentItems.sort((a, b) => {
                                if (value === 'default') {
                                    return (
                                        originalOrder.indexOf(a) -
                                        originalOrder.indexOf(b)
                                    );
                                }

                                const nameA =
                                    a
                                        .querySelector('.base-tile-title')
                                        ?.textContent?.trim() || '';
                                const nameB =
                                    b
                                        .querySelector('.base-tile-title')
                                        ?.textContent?.trim() || '';

                                switch (value) {
                                    case 'az':
                                        return nameA.localeCompare(nameB);
                                    case 'za':
                                        return nameB.localeCompare(nameA);
                                    case 'newest': {
                                        const idA = getGroupIdFromUrl(
                                            a
                                                .querySelector('a')
                                                ?.getAttribute('href'),
                                        );
                                        const idB = getGroupIdFromUrl(
                                            b
                                                .querySelector('a')
                                                ?.getAttribute('href'),
                                        );
                                        const dateA =
                                            getCachedJoinDate(idA, userId) ||
                                            new Date(0);
                                        const dateB =
                                            getCachedJoinDate(idB, userId) ||
                                            new Date(0);
                                        return dateB - dateA;
                                    }
                                    case 'oldest': {
                                        const idA = getGroupIdFromUrl(
                                            a
                                                .querySelector('a')
                                                ?.getAttribute('href'),
                                        );
                                        const idB = getGroupIdFromUrl(
                                            b
                                                .querySelector('a')
                                                ?.getAttribute('href'),
                                        );
                                        const dateA =
                                            getCachedJoinDate(idA, userId) ||
                                            new Date(0);
                                        const dateB =
                                            getCachedJoinDate(idB, userId) ||
                                            new Date(0);
                                        return dateA - dateB;
                                    }
                                    default:
                                        return 0;
                                }
                            });

                            if (currentView === 'default') {
                                activeCarousel.style.display = 'flex';
                                activeCarousel.style.flexWrap = 'nowrap';
                                activeCarousel.style.gridTemplateColumns = '';

                                if (rowButtons) rowButtons.style.display = 'block';
                            } else {
                                activeCarousel.style.display = 'grid';
                                activeCarousel.style.gridTemplateColumns = 'repeat(6, 1fr)'; // 6 items per row, Roblox's default
                                activeCarousel.style.flexWrap = '';

                                if (rowButtons) rowButtons.style.display = 'none';
                            }

                            currentItems.forEach((item) =>
                                activeCarousel.appendChild(item),
                            );
                        },
                    });

                    const filterToggles = document.createElement('div');
                    filterToggles.style.display = 'flex';
                    filterToggles.style.alignItems = 'center';
                    filterToggles.style.flexDirection = 'row';
                    filterToggles.style.gap = '12px';

                    headerWrapper.appendChild(viewToggle);
                    filterToggles.style.marginLeft = 'auto';
                    headerWrapper.appendChild(filterToggles);

                    filterToggles.appendChild(toggle);

                    applyView(storedView);
                };

                setup();
                observeChildren(container, setup);
            },
            { multiple: true },
        );
    });
}
