import { callRobloxApi } from '../../core/api.js';
import { ts } from '../../core/locale/i18n.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';

const ui = (key, options) => ts(`settings.ui.privateServers.${key}`, options);

const LIST_ENDPOINT =
    '/v1/private-servers/my-private-servers?itemsPerPage=100&privateServersTab=MyPrivateServers';
// Local-only labels (never sent to Roblox): { [privateServerId]: string }.
const LABELS_STORAGE_KEY = 'vipServerLabels';
const LABEL_MAX_LENGTH = 60;
const EXPIRY_WARNING_DAYS = 7;
const BULK_REQUEST_DELAY_MS = 500;

async function fetchAllServers() {
    const allServers = [];
    let nextCursor = '';

    do {
        const endpoint = nextCursor
            ? `${LIST_ENDPOINT}&cursor=${encodeURIComponent(nextCursor)}`
            : LIST_ENDPOINT;
        const response = await callRobloxApi({
            subdomain: 'games',
            endpoint,
            method: 'GET',
            noCache: true,
        });
        if (!response.ok) {
            throw new Error(`Private server list failed: ${response.status}`);
        }

        const body = await response.json();
        if (Array.isArray(body.data)) {
            allServers.push(...body.data);
        }
        nextCursor = body.nextPageCursor || '';
    } while (nextCursor);

    return allServers;
}

async function getLabels() {
    const stored = await chrome.storage.local.get(LABELS_STORAGE_KEY);
    const labels = stored[LABELS_STORAGE_KEY];
    return labels && typeof labels === 'object' && !Array.isArray(labels)
        ? labels
        : {};
}

async function saveLabel(serverId, rawValue) {
    const labels = await getLabels();
    const value = String(rawValue || '')
        .trim()
        .slice(0, LABEL_MAX_LENGTH);
    if (value) {
        labels[serverId] = value;
    } else {
        delete labels[serverId];
    }
    await chrome.storage.local.set({ [LABELS_STORAGE_KEY]: labels });
}

async function patchFriendsAllowed(privateServerId) {
    return callRobloxApi({
        subdomain: 'games',
        endpoint: `/v1/vip-servers/${privateServerId}/permissions`,
        method: 'PATCH',
        body: { friendsAllowed: true },
    });
}

function markRowAllowed(list, serverId) {
    const row = list.querySelector(`[data-server-id="${String(serverId)}"]`);
    if (!row) return;
    const rowButton = row.querySelector('.rovalra-psm-allow-button');
    if (!rowButton) return;
    rowButton.textContent = ui('allowDone');
    rowButton.classList.add('rovalra-psm-allow-done');
    rowButton.disabled = true;
}

function createExpiryPill(server) {
    const expiration = server.expirationDate
        ? new Date(server.expirationDate)
        : null;
    const hasValidDate =
        expiration && !Number.isNaN(expiration.getTime());

    let text;
    let tone;
    if (!hasValidDate) {
        text = ui('noExpiryDate');
        tone = 'neutral';
    } else if (expiration.getTime() <= Date.now()) {
        text = ui('expired');
        tone = 'expired';
    } else {
        const daysLeft = Math.ceil(
            (expiration.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        );
        if (daysLeft <= EXPIRY_WARNING_DAYS) {
            text = ui('expiresSoon', { days: daysLeft });
            tone = 'warning';
        } else {
            text = ui('expiresOn', {
                date: expiration.toLocaleDateString(),
            });
            tone = 'ok';
        }
    }

    const pill = document.createElement('span');
    pill.className = `rovalra-psm-pill rovalra-psm-pill-${tone}`;
    pill.textContent = text;
    return pill;
}

async function runBulkAllow(servers, list) {
    let isCancelled = false;

    const bodyContent = document.createElement('div');
    bodyContent.className = 'rovalra-psm-progress';

    const progressText = document.createElement('div');
    progressText.id = 'rovalra-psm-progress-text';
    progressText.textContent = ui('starting');

    const spinner = createSpinner({ size: '32px' });

    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'rovalra-psm-results';
    resultsContainer.style.display = 'none';

    bodyContent.append(progressText, spinner, resultsContainer);

    const cancelButton = createButton(ui('cancel'), 'primary-destructive', {
        onClick: () => {
            isCancelled = true;
            progressText.textContent = ui('cancelling');
            cancelButton.disabled = true;
        },
    });

    const { overlay, close } = createOverlay({
        title: ui('processingTitle'),
        bodyContent,
        actions: [cancelButton],
        maxWidth: '500px',
    });
    const footer = overlay.querySelector('.flex.justify-end');

    const total = servers.length;
    const errorLog = [];
    let successCount = 0;

    for (let i = 0; i < total; i++) {
        if (isCancelled) break;
        const server = servers[i];
        progressText.textContent = ui('updating', {
            current: i + 1,
            total,
        });

        try {
            const response = await patchFriendsAllowed(server.privateServerId);
            if (response.ok) {
                successCount += 1;
                markRowAllowed(list, server.privateServerId);
            } else {
                let reason = ui('requestFailed');
                try {
                    const errorData = await response.json();
                    const apiMessage = errorData?.errors?.[0]?.message;
                    if (apiMessage) reason = String(apiMessage);
                } catch {
                    // Keep the generic message when the body isn't JSON.
                }
                errorLog.push({ name: server.name || '', reason });
            }
        } catch (error) {
            errorLog.push({
                name: server.name || '',
                reason: error?.message || ui('requestFailed'),
            });
        }

        if (i < total - 1 && !isCancelled) {
            await new Promise((resolve) =>
                setTimeout(resolve, BULK_REQUEST_DELAY_MS),
            );
        }
    }

    spinner.style.display = 'none';
    resultsContainer.style.display = 'flex';
    resultsContainer.textContent = '';
    if (footer) footer.innerHTML = '';

    if (isCancelled) {
        progressText.textContent = ui('cancelled', { count: successCount });
    } else {
        progressText.textContent = ui('completed', {
            successCount,
            errorCount: errorLog.length,
        });
    }

    if (errorLog.length > 0) {
        const errorList = document.createElement('ul');
        errorLog.forEach((entry) => {
            const item = document.createElement('li');
            item.textContent = `${entry.name}: ${entry.reason}`;
            errorList.appendChild(item);
        });
        resultsContainer.appendChild(errorList);
    }

    const headerSpan = overlay.querySelector('.rovalra-overlay-header > span');
    if (headerSpan) {
        headerSpan.textContent = ui('processingComplete');
    }

    setTimeout(close, 5000);
}

function appendStatus(container, text) {
    const status = document.createElement('div');
    status.className = 'rovalra-changelog-status';
    status.textContent = text;
    container.appendChild(status);
}

export async function renderPrivateServerManager(container) {
    container.innerHTML = '';
    appendStatus(container, ui('loading'));

    let servers;
    let labels;
    let thumbnailMap = new Map();

    try {
        [servers, labels] = await Promise.all([
            fetchAllServers(),
            getLabels(),
        ]);
        if (servers.length) {
            thumbnailMap = await fetchThumbnails(
                servers.map((server) => ({ id: server.universeId })),
                'GameIcon',
                '150x150',
            );
        }
    } catch (error) {
        console.warn('RoValra: Failed to load private servers', error);
        container.innerHTML = '';
        appendStatus(container, ui('loadFailed'));
        return;
    }

    container.innerHTML = '';
    if (!servers.length) {
        appendStatus(container, ui('empty'));
        return;
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'rovalra-psm-toolbar';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'rovalra-psm-search';
    searchInput.placeholder = ui('searchPlaceholder');
    searchInput.setAttribute('aria-label', ui('searchPlaceholder'));

    const bulkButton = createButton(ui('bulkButton'), 'primary', {
        onClick: () => {
            showConfirmationPrompt({
                title: ui('bulkAllowTitle'),
                message: ui('bulkAllowMessage', { count: servers.length }),
                confirmText: ui('bulkAllowConfirm'),
                confirmType: 'primary',
                onConfirm: () => {
                    runBulkAllow(servers, list);
                },
            });
        },
    });

    toolbar.append(searchInput, bulkButton);

    const list = document.createElement('div');
    list.className = 'rovalra-psm-list';
    container.append(toolbar, list);

    function createRow(server) {
        const row = document.createElement('div');
        row.className = 'rovalra-psm-row';
        row.dataset.serverId = String(server.privateServerId);

        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'rovalra-psm-thumb';
        const image = document.createElement('img');
        const thumbData = thumbnailMap.get(Number(server.universeId));
        if (thumbData && thumbData.imageUrl) {
            image.src = thumbData.imageUrl;
        }
        image.alt = '';
        image.loading = 'lazy';
        thumbWrap.appendChild(image);

        const info = document.createElement('div');
        info.className = 'rovalra-psm-info';

        const nameRow = document.createElement('div');
        nameRow.className = 'rovalra-psm-name-row';

        const name = document.createElement('span');
        name.className = 'rovalra-psm-name';
        const serverName = server.name || ui('unnamed');
        name.textContent = serverName;
        name.title = serverName;

        nameRow.append(name, createExpiryPill(server));

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'rovalra-psm-label-input';
        labelInput.placeholder = ui('labelPlaceholder');
        labelInput.maxLength = LABEL_MAX_LENGTH;
        labelInput.value = labels[server.privateServerId] || '';
        labelInput.addEventListener('change', async () => {
            labelInput.disabled = true;
            try {
                await saveLabel(server.privateServerId, labelInput.value);
                labels = await getLabels();
                labelInput.value = labels[server.privateServerId] || '';
            } catch (error) {
                console.warn(
                    'RoValra: Failed to save a private server label',
                    error,
                );
            } finally {
                labelInput.disabled = false;
            }
        });

        info.append(nameRow, labelInput);

        const allowButton = createButton(ui('allowFriends'), 'secondary', {
            onClick: async () => {
                if (allowButton.disabled) return;
                allowButton.disabled = true;
                try {
                    const response = await patchFriendsAllowed(
                        server.privateServerId,
                    );
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    allowButton.textContent = ui('allowDone');
                    allowButton.classList.add('rovalra-psm-allow-done');
                } catch (error) {
                    console.error(
                        'RoValra: Failed to allow friends on a private server',
                        error,
                    );
                    allowButton.textContent = ui('allowFailed');
                    setTimeout(() => {
                        allowButton.textContent = ui('allowFriends');
                        allowButton.disabled = false;
                    }, 2500);
                }
            },
        });
        allowButton.classList.add('rovalra-psm-allow-button');

        row.append(thumbWrap, info, allowButton);
        return row;
    }

    function renderRows() {
        const query = searchInput.value.trim().toLowerCase();
        list.innerHTML = '';

        const visible = servers.filter((server) => {
            if (!query) return true;
            const label = labels[server.privateServerId] || '';
            return (
                String(server.name || '')
                    .toLowerCase()
                    .includes(query) ||
                label.toLowerCase().includes(query)
            );
        });

        if (!visible.length) {
            appendStatus(list, ui('noMatches'));
            return;
        }

        visible.forEach((server) => {
            list.appendChild(createRow(server));
        });
    }

    searchInput.addEventListener('input', renderRows);
    renderRows();
}
