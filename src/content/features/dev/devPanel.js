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

const PANEL_ICON_PATHS = {
    terminal: ['M4 17l6-6-6-6', 'M12 19h8'],
    copy: [
        'M9 9h10v10H9z',
        'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
    ],
    external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6'],
    refresh: ['M20 11a8 8 0 1 0 1 4', 'M20 4v7h-7'],
    page: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
    ids: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
    tools: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-3-3 3-3z'],
    user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    group: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    game: ['M6 9h12v10H6z', 'M3 13h3', 'M18 13h3', 'M7 6l1-2', 'M17 6l-1-2', 'M8 13h.01', 'M16 13h.01'],
    catalog: ['M4 4h16v16H4z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
    dashboard: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
    docs: ['M5 3h10l4 4v14H5z', 'M15 3v5h5', 'M8 12h8', 'M8 16h6'],
};

function createPanelIcon(name, size = 18) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.width = `${size}px`;
    svg.style.height = `${size}px`;
    svg.style.display = 'block';
    svg.style.flexShrink = '0';

    (PANEL_ICON_PATHS[name] || PANEL_ICON_PATHS.tools).forEach((pathData) => {
        const path = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path',
        );
        path.setAttribute('d', pathData);
        svg.appendChild(path);
    });

    return svg;
}

function createDevIcon() {
    return createPanelIcon('terminal', 20);
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
    const label = button.querySelector('.rovalra-devpanel-action-label');
    const originalText = label?.textContent || button.textContent;
    if (label) {
        label.textContent = text;
    } else {
        button.textContent = text;
    }
    setTimeout(() => {
        if (label) {
            label.textContent = originalText;
        } else {
            button.textContent = originalText;
        }
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

    const copyButton = createIconButton(t('copy'), 'copy', async () => {
        try {
            await navigator.clipboard.writeText(valueText);
            flashButtonText(copyButton, t('copied'));
        } catch (error) {
            console.error('RoValra: Failed to copy from dev panel', error);
            flashButtonText(copyButton, t('error'));
        }
    });
    copyButton.classList.add('rovalra-devpanel-copy');

    row.append(label, value, copyButton);
    return row;
}

function createIconButton(labelText, iconName, onClick) {
    const button = createButton('', 'secondary', { onClick });
    button.classList.add('rovalra-devpanel-action');
    button.setAttribute('aria-label', labelText);

    const label = document.createElement('span');
    label.className = 'rovalra-devpanel-action-label';
    label.textContent = labelText;
    button.append(createPanelIcon(iconName, 16), label);
    return button;
}

function createLinkButton(labelText, href, iconName = 'external') {
    return createIconButton(labelText, iconName, () => {
        window.open(href, '_blank', 'noopener');
    });
}

function createSection(titleText, iconName = 'tools') {
    const section = document.createElement('section');
    section.className = 'rovalra-devpanel-section';

    const title = document.createElement('h3');
    title.className = 'rovalra-devpanel-section-title';
    title.append(createPanelIcon(iconName, 17));
    const titleLabel = document.createElement('span');
    titleLabel.textContent = titleText;
    title.appendChild(titleLabel);
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
    const button = createIconButton(t('copyAllIds'), 'copy', async () => {
        const values = [
            ...document.querySelectorAll(
                '.rovalra-devpanel-id-section .rovalra-devpanel-row',
            ),
        ]
            .filter((row) => row.querySelector('.rovalra-devpanel-copy'))
            .map((row) =>
                row.querySelector('.rovalra-devpanel-value')?.textContent.trim(),
            )
            .filter(Boolean);

        if (values.length === 0) {
            flashButtonText(button, t('noIdsToCopy'));
            return;
        }

        try {
            await navigator.clipboard.writeText(values.join('\n'));
            flashButtonText(button, t('copied'));
        } catch (error) {
            console.error('RoValra: Failed to copy dev IDs', error);
            flashButtonText(button, t('error'));
        }
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
    let ownId = null;
    let universeId = null;

    const pageSection = createSection(t('sections.page'), 'page');
    pageSection.append(
        createInfoRow(
            t('pageType'),
            getPageType({ placeId, userId, groupId, assetId }),
        ),
        createInfoRow(t('currentUrl'), href),
    );

    const pageActions = document.createElement('div');
    pageActions.className = 'rovalra-devpanel-links';
    const copyUrlButton = createIconButton(t('copyUrl'), 'copy', async () => {
        try {
            await navigator.clipboard.writeText(href);
            flashButtonText(copyUrlButton, t('copied'));
        } catch (error) {
            console.error('RoValra: Failed to copy the current URL', error);
            flashButtonText(copyUrlButton, t('error'));
        }
    });
    pageActions.append(
        copyUrlButton,
        createIconButton(t('refresh'), 'refresh', () => {
            buildPanelBody(body);
        }),
    );
    pageSection.appendChild(pageActions);
    body.appendChild(pageSection);

    const idSection = createSection(t('sections.ids'), 'ids');
    idSection.classList.add('rovalra-devpanel-id-section');

    try {
        const [authenticatedId, ownUsername] = await Promise.all([
            getAuthenticatedUserId(),
            getAuthenticatedUsername(),
        ]);
        ownId = authenticatedId;
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
            universeId =
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

    const linksSection = createSection(t('sections.links'), 'tools');
    const linksRow = document.createElement('div');
    linksRow.className = 'rovalra-devpanel-links';
    linksRow.appendChild(createLinkButton(t('openCurrentPage'), href, 'page'));

    if (userId) {
        linksRow.appendChild(
            createLinkButton(
                t('openProfile'),
                `https://www.roblox.com/users/${userId}/profile`,
                'user',
            ),
        );
    }
    if (groupId) {
        linksRow.appendChild(
            createLinkButton(
                t('openGroup'),
                `https://www.roblox.com/communities/${groupId}`,
                'group',
            ),
        );
    }
    if (assetId) {
        linksRow.appendChild(
            createLinkButton(
                t('openCatalogItem'),
                `https://www.roblox.com/catalog/${assetId}`,
                'catalog',
            ),
        );
    }
    if (placeId) {
        linksRow.append(
            createLinkButton(
                t('openPlace'),
                `https://www.roblox.com/games/${placeId}/`,
                'game',
            ),
            createLinkButton(
                t('openConfigure'),
                `https://www.roblox.com/places/${placeId}/update`,
                'tools',
            ),
        );
    }
    if (ownId) {
        linksRow.appendChild(
            createLinkButton(
                t('openMyAvatar'),
                'https://www.roblox.com/my/avatar',
                'user',
            ),
        );
    }
    if (universeId) {
        linksRow.appendChild(
            createLinkButton(
                t('openUniverse'),
                `https://www.roblox.com/games?universeId=${universeId}`,
                'game',
            ),
        );
    }
    linksRow.append(
        createLinkButton(
            t('openDashboard'),
            'https://create.roblox.com/dashboard/creations',
            'dashboard',
        ),
        createLinkButton(
            t('openDevDocs'),
            'https://create.roblox.com/docs',
            'docs',
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
        maxWidth: '600px',
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

function findGiftCardsLink(nav) {
    return [...nav.querySelectorAll('a[href]')].find((link) => {
        if (link.closest(`[${PANEL_ITEM_ATTR}]`)) return false;

        const label = link.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
        if (label === 'buy gift cards') return true;

        try {
            const path = new URL(link.href, window.location.origin).pathname;
            return /\/gift-?cards\/?$/i.test(path);
        } catch {
            return false;
        }
    });
}

function appendPanelItem(nav) {
    const region =
        nav.closest('#left-navigation-container, #navigation, .navigation') ||
        nav;
    const giftCardsLink = findGiftCardsLink(nav);
    const existingItem = cleanupPanelItems(region);

    if (existingItem) {
        const sidebar = giftCardsLink && getSidebarContainer(giftCardsLink);
        const giftCardsItem =
            sidebar && getSidebarItem(sidebar, giftCardsLink);
        if (giftCardsItem) {
            giftCardsItem.insertAdjacentElement('afterend', existingItem);
        }
        return;
    }

    const templateLink = giftCardsLink ||
        [...nav.querySelectorAll('a[href]')].find(
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

    if (giftCardsLink) {
        const giftCardsSidebar = getSidebarContainer(giftCardsLink);
        const giftCardsItem =
            giftCardsSidebar && getSidebarItem(giftCardsSidebar, giftCardsLink);
        if (giftCardsItem) {
            giftCardsItem.insertAdjacentElement('afterend', item);
            return;
        }
    }

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
