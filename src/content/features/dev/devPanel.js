import { observeElement } from '../../core/observer.js';
import {
    getPlaceIdFromUrl,
    getUserIdFromUrl,
    getGroupIdFromUrl,
    getAssetIdFromUrl,
} from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
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

async function buildPanelBody(body) {
    body.className = 'rovalra-devpanel';
    body.textContent = '';

    const href = window.location.href;
    const placeId = getPlaceIdFromUrl(href);
    const userId = getUserIdFromUrl(href);
    const groupId = getGroupIdFromUrl(href);
    const assetId = getAssetIdFromUrl(href);

    try {
        const ownId = await getAuthenticatedUserId();
        if (ownId) {
            body.appendChild(createCopyRow(t('myUserId'), String(ownId)));
        }
    } catch (error) {
        console.warn('RoValra: Failed to load own user ID for dev panel', error);
    }

    let hasContext = false;

    if (userId) {
        body.appendChild(createCopyRow(t('userId'), String(userId)));
        hasContext = true;
    }

    if (groupId) {
        body.appendChild(createCopyRow(t('groupId'), String(groupId)));
        hasContext = true;
    }

    if (assetId) {
        body.appendChild(createCopyRow(t('assetId'), String(assetId)));
        hasContext = true;
    }

    const dashboardButton = createLinkButton(
        t('openDashboard'),
        'https://create.roblox.com/dashboard/creations',
    );

    if (placeId) {
        body.appendChild(createCopyRow(t('placeId'), String(placeId)));
        body.appendChild(
            createCopyRow(
                t('placeUrl'),
                `https://www.roblox.com/games/${placeId}/`,
            ),
        );

        const universeRow = createCopyRow(t('universeId'), t('loadingIds'));
        body.appendChild(universeRow);
        const universeValue = universeRow.querySelector(
            '.rovalra-devpanel-value',
        );
        const universeCopy = universeRow.querySelector(
            '.rovalra-devpanel-copy',
        );
        if (universeCopy) universeCopy.disabled = true;

        const linksRow = document.createElement('div');
        linksRow.className = 'rovalra-devpanel-links';
        linksRow.append(
            createLinkButton(
                t('openConfigure'),
                `https://www.roblox.com/places/${placeId}/update`,
            ),
            dashboardButton,
        );
        body.append(linksRow);

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
        return;
    }

    if (!hasContext) {
        const note = document.createElement('p');
        note.className = 'rovalra-devpanel-note';
        note.textContent = t('noGamePage');
        body.append(note, dashboardButton);
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

function classNameOf(element) {
    const className = element.className;
    if (typeof className === 'string') return className;
    if (className && typeof className.baseVal === 'string') {
        return className.baseVal;
    }
    return '';
}

function appendPanelItem(nav) {
    // Guard the whole sidebar region: sibling lists in the same nav must
    // not each mint their own copy.
    const region =
        nav.closest('#left-navigation-container, #navigation, .navigation') ||
        nav;
    if (region.querySelector(`[${PANEL_ITEM_ATTR}]`)) return;
    const templateLink = nav.querySelector('a[href]');
    if (!templateLink) return;
    let templateItem = templateLink;
    while (templateItem?.parentElement && templateItem.parentElement !== nav) {
        templateItem = templateItem.parentElement;
    }
    if (!templateItem || templateItem.parentElement !== nav) return;

    const item = templateItem.cloneNode(true);
    const link = item.querySelector('a[href]');
    if (!link) return;
    stripItemState(item);

    // Drop every icon-ish or empty child (original icons, status dots,
    // badges) so no leftover glyph survives next to our icon. Text-bearing
    // leaves are kept for the label step below.
    [...link.children].forEach((child) => {
        const text = (child.textContent || '').trim();
        const hasIconDescendant = !!child.querySelector(
            'svg, icon, [class*="icon"], [class*="Icon"]',
        );
        const isIconItself =
            child.tagName === 'SVG' ||
            child.tagName === 'ICON' ||
            /icon/i.test(classNameOf(child));
        if (!text || hasIconDescendant || isIconItself) child.remove();
    });

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

    const iconHost = document.createElement('span');
    iconHost.className = 'rovalra-dev-panel-icon';
    iconHost.appendChild(createDevIcon());
    link.prepend(iconHost);

    link.setAttribute('href', '#rovalra-dev-panel');
    link.setAttribute(PANEL_LINK_ATTR, 'true');
    item.setAttribute(PANEL_ITEM_ATTR, 'true');
    link.addEventListener('click', (event) => {
        event.preventDefault();
        openDevPanel();
    });

    nav.appendChild(item);
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
