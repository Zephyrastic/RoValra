import { observeElement } from '../../core/observer.js';
import {
    getPlaceIdFromUrl,
    getUserIdFromUrl,
    getGroupIdFromUrl,
    getAssetIdFromUrl,
} from '../../core/idExtractor.js';
import {
    getAuthenticatedUserId,
    getAuthenticatedUsername,
} from '../../core/user.js';
import { getPlacesDetails } from '../../core/apis/games.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { ts } from '../../core/locale/i18n.js';

const PANEL_ITEM_ATTR = 'data-rovalra-dev-panel-item';
const PANEL_LINK_ATTR = 'data-rovalra-dev-panel-link';
const COPY_FEEDBACK_MS = 1500;

const t = (key) => ts(`devPanel.${key}`);

function createDevIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.width = '20px';
    svg.style.height = '20px';
    svg.style.display = 'block';

    const prompt = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );
    prompt.setAttribute('d', 'M4 17l6-6-6-6');

    const cursor = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );
    cursor.setAttribute('d', 'M12 19h8');

    svg.append(prompt, cursor);
    return svg;
}

function stripItemState(item) {
    [item, ...item.querySelectorAll('*')].forEach((element) => {
        element.removeAttribute('id');
        element.removeAttribute('aria-current');
        element.removeAttribute('aria-selected');
        [...element.attributes].forEach((attribute) => {
            if (attribute.name.startsWith('data-')) {
                element.removeAttribute(attribute.name);
            }
        });
        element.classList.remove(
            'active',
            'selected',
            'active-menu-item',
            'selected-menu-item',
            'router-link-active',
            'router-link-exact-active',
        );
    });
}

function flashButtonText(button, text) {
    const originalText = button.textContent;
    button.textContent = text;
    setTimeout(() => {
        button.textContent = originalText;
    }, COPY_FEEDBACK_MS);
}

function createCopyRow(labelText, valueText) {
    const row = document.createElement('div');
    row.className = 'rovalra-devpanel-row';

    const label = document.createElement('span');
    label.className = 'rovalra-devpanel-label';
    label.textContent = labelText;

    const value = document.createElement('code');
    value.className = 'rovalra-devpanel-value';
    value.textContent = valueText;

    const copyButton = createButton(ts('quickPlay.copyLink'), 'secondary', {
        onClick: async () => {
            try {
                await navigator.clipboard.writeText(valueText);
                flashButtonText(copyButton, ts('quickPlay.copied'));
            } catch (error) {
                console.error('RoValra: Failed to copy from dev panel', error);
                flashButtonText(copyButton, ts('quickPlay.error'));
            }
        },
    });
    copyButton.classList.add('rovalra-devpanel-copy');

    row.append(label, value, copyButton);
    return row;
}

function createLinkButton(labelText, href) {
    return createButton(labelText, 'secondary', {
        onClick: () => {
            window.open(href, '_blank', 'noopener');
        },
    });
}

function createSection(titleText) {
    const section = document.createElement('section');
    section.className = 'rovalra-devpanel-section';

    const title = document.createElement('h3');
    title.className = 'rovalra-devpanel-section-title';
    title.textContent = titleText;
    section.appendChild(title);

    return section;
}

function createInfoRow(labelText, valueText) {
    const row = document.createElement('div');
    row.className = 'rovalra-devpanel-row';

    const label = document.createElement('span');
    label.className = 'rovalra-devpanel-label';
    label.textContent = labelText;

    const value = document.createElement('code');
    value.className = 'rovalra-devpanel-value';
    value.textContent = valueText;

    row.append(label, value);
    return row;
}

function getPageType({ placeId, userId, groupId, assetId }) {
    if (placeId) return t('pageTypes.game');
    if (userId) return t('pageTypes.profile');
    if (groupId) return t('pageTypes.community');
    if (assetId) return t('pageTypes.catalog');
    return t('pageTypes.other');
}

function createCopyAllButton() {
    const button = createButton(t('copyAllIds'), 'secondary', {
        onClick: async () => {
            const values = [
                ...document.querySelectorAll(
                    '.rovalra-devpanel-id-section .rovalra-devpanel-value',
                ),
            ]
                .map((value) => value.textContent.trim())
                .filter(Boolean);

            if (values.length === 0) {
                flashButtonText(button, t('noIdsToCopy'));
                return;
            }

            try {
                await navigator.clipboard.writeText(values.join('\n'));
                flashButtonText(button, ts('quickPlay.copied'));
            } catch (error) {
                console.error('RoValra: Failed to copy dev IDs', error);
                flashButtonText(button, ts('quickPlay.error'));
            }
        },
    });

    return button;
}

async function buildPanelBody(body) {
    body.className = 'rovalra-devpanel';
    body.textContent = '';

    const href = window.location.href;
    const placeId = getPlaceIdFromUrl(href);
    const userId = getUserIdFromUrl(href);
    const groupId = getGroupIdFromUrl(href);
    const assetId = getAssetIdFromUrl(href);
    const hasContext = Boolean(placeId || userId || groupId || assetId);

    const pageSection = createSection(t('sections.page'));
    pageSection.append(
        createInfoRow(
            t('pageType'),
            getPageType({ placeId, userId, groupId, assetId }),
        ),
        createCopyRow(t('currentUrl'), href),
    );
    body.appendChild(pageSection);

    const idSection = createSection(t('sections.ids'));
    idSection.classList.add('rovalra-devpanel-id-section');

    try {
        const [ownId, ownUsername] = await Promise.all([
            getAuthenticatedUserId(),
            getAuthenticatedUsername(),
        ]);
        if (ownId) {
            idSection.appendChild(
                createCopyRow(t('myUserId'), String(ownId)),
            );
        }
        if (ownUsername) {
            idSection.appendChild(createInfoRow(t('myUsername'), ownUsername));
        }
    } catch (error) {
        console.warn('RoValra: Failed to load own account for dev panel', error);
    }

    if (userId) {
        idSection.appendChild(createCopyRow(t('userId'), String(userId)));
    }
    if (groupId) {
        idSection.appendChild(createCopyRow(t('groupId'), String(groupId)));
    }
    if (assetId) {
        idSection.appendChild(createCopyRow(t('assetId'), String(assetId)));
    }

    if (placeId) {
        idSection.appendChild(createCopyRow(t('placeId'), String(placeId)));
        const universeRow = createCopyRow(
            t('universeId'),
            t('loadingIds'),
        );
        idSection.appendChild(universeRow);
        const universeValue = universeRow.querySelector(
            '.rovalra-devpanel-value',
        );
        const universeCopy = universeRow.querySelector(
            '.rovalra-devpanel-copy',
        );
        if (universeCopy) universeCopy.disabled = true;

        try {
            const details = await getPlacesDetails([placeId]);
            const universeId =
                details?.[0]?.universeId ?? details?.[0]?.universeID ?? null;
            if (universeId) {
                const freshRow = createCopyRow(
                    t('universeId'),
                    String(universeId),
                );
                universeRow.replaceWith(freshRow);
            } else if (universeValue) {
                universeValue.textContent = t('universeLoadFailed');
            }
        } catch (error) {
            console.warn(
                'RoValra: Failed to load universe ID for dev panel',
                error,
            );
            if (universeValue) {
                universeValue.textContent = t('universeLoadFailed');
            }
        }
    }

    const idActions = document.createElement('div');
    idActions.className = 'rovalra-devpanel-links';
    idActions.appendChild(createCopyAllButton());
    idSection.appendChild(idActions);
    body.appendChild(idSection);

    const linksSection = createSection(t('sections.links'));
    const linksRow = document.createElement('div');
    linksRow.className = 'rovalra-devpanel-links';
    linksRow.appendChild(createLinkButton(t('openCurrentPage'), href));

    if (userId) {
        linksRow.appendChild(
            createLinkButton(
                t('openProfile'),
                `https://www.roblox.com/users/${userId}/profile`,
            ),
        );
    }
    if (groupId) {
        linksRow.appendChild(
            createLinkButton(
                t('openGroup'),
                `https://www.roblox.com/communities/${groupId}`,
            ),
        );
    }
    if (assetId) {
        linksRow.appendChild(
            createLinkButton(
                t('openCatalogItem'),
                `https://www.roblox.com/catalog/${assetId}`,
            ),
        );
    }
    if (placeId) {
        linksRow.append(
            createLinkButton(
                t('openPlace'),
                `https://www.roblox.com/games/${placeId}/`,
            ),
            createLinkButton(
                t('openConfigure'),
                `https://www.roblox.com/places/${placeId}/update`,
            ),
        );
    }
    linksRow.appendChild(
        createLinkButton(
            t('openDashboard'),
            'https://create.roblox.com/dashboard/creations',
        ),
    );
    linksSection.appendChild(linksRow);
    body.appendChild(linksSection);

    if (!hasContext) {
        const note = document.createElement('p');
        note.className = 'rovalra-devpanel-note';
        note.textContent = t('noGamePage');
        body.appendChild(note);
    }
}

function openDevPanel() {
    const body = document.createElement('div');
    const { close } = createOverlay({
        title: t('title'),
        bodyContent: body,
        actions: [
            createButton(t('close'), 'secondary', {
                onClick: () => close(),
            }),
        ],
        maxWidth: '480px',
    });
    buildPanelBody(body);
}

const NAV_ITEM_SELECTOR = [
    'li',
    '[role="menuitem"]',
    '[role="listitem"]',
    '.roseal-left-nav-item',
].join(', ');

function getSidebarContainer(anchor) {
    return anchor.closest('ul, ol, nav, [role="navigation"]');
}

function getSidebarItem(sidebar, link) {
    const item = link.closest(NAV_ITEM_SELECTOR);
    if (!item || item === sidebar || !sidebar.contains(item)) return null;
    return item;
}

function cleanupPanelItems(region) {
    const items = [...region.querySelectorAll(`[${PANEL_ITEM_ATTR}]`)];
    const validItems = [];

    items.forEach((item) => {
        const link = item.querySelector(`a[${PANEL_LINK_ATTR}]`);
        const isSingleItem =
            item.matches(NAV_ITEM_SELECTOR) &&
            link &&
            item.querySelectorAll('a[href]').length === 1;
        if (isSingleItem) {
            validItems.push(item);
        } else {
            item.remove();
        }
    });

    validItems.slice(1).forEach((item) => item.remove());
    return validItems[0] || null;
}

function prepareLinkIcon(link) {
    const originalIcon = link.querySelector(
        'svg, icon, [class*="icon"], [class*="Icon"]',
    );
    let originalHost = originalIcon;
    while (
        originalHost?.parentElement &&
        originalHost.parentElement !== link
    ) {
        originalHost = originalHost.parentElement;
    }

    const canReuseHost =
        originalHost?.parentElement === link &&
        originalHost.tagName !== 'SVG' &&
        originalHost.tagName !== 'ICON' &&
        !originalHost.textContent.trim();

    const iconHost = canReuseHost
        ? originalHost
        : document.createElement('span');
    iconHost.classList.add('rovalra-dev-panel-icon');
    iconHost.replaceChildren(createDevIcon());

    if (!canReuseHost) {
        if (originalHost?.parentElement === link) {
            originalHost.replaceWith(iconHost);
        } else {
            link.prepend(iconHost);
        }
    }

    [...link.children].forEach((child) => {
        if (child !== iconHost && !child.textContent.trim()) child.remove();
    });

    return iconHost;
}

function appendPanelItem(nav) {
    const region =
        nav.closest('#left-navigation-container, #navigation, .navigation') ||
        nav;
    if (cleanupPanelItems(region)) return;

    const templateLink = [...nav.querySelectorAll('a[href]')].find(
        (link) =>
            !link.closest(`[${PANEL_ITEM_ATTR}]`) && link.textContent.trim(),
    );
    if (!templateLink) return;

    const sidebar = getSidebarContainer(templateLink);
    const templateItem = sidebar && getSidebarItem(sidebar, templateLink);
    if (!templateItem || templateItem.querySelectorAll('a[href]').length !== 1) {
        return;
    }

    const item = templateItem.cloneNode(true);
    const link = item.querySelector('a[href]');
    if (!link) return;
    stripItemState(item);
    prepareLinkIcon(link);

    const labelTarget = [...link.querySelectorAll('*')]
        .filter(
            (element) =>
                element.children.length === 0 && element.textContent.trim(),
        )
        .at(-1);
    if (labelTarget) {
        labelTarget.textContent = t('sidebarLabel');
    } else {
        const span = document.createElement('span');
        span.textContent = t('sidebarLabel');
        link.appendChild(span);
    }

    link.setAttribute('href', '#rovalra-dev-panel');
    link.setAttribute(PANEL_LINK_ATTR, 'true');
    link.setAttribute('aria-label', t('sidebarLabel'));
    item.setAttribute(PANEL_ITEM_ATTR, 'true');
    link.addEventListener('click', (event) => {
        event.preventDefault();
        openDevPanel();
    });

    const insertionParent = templateItem.parentElement || nav;
    insertionParent.appendChild(item);
}

export function init() {
    observeElement(
        '.left-nav nav',
        (nav) => {
            appendPanelItem(nav);
        },
        { multiple: true },
    );
}
