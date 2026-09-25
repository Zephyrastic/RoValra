import { callRobloxApi } from '../../core/api.js';
import { ts } from '../../core/locale/i18n.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';

const ui = (key, options) => ts(`settings.ui.privateServers.${key}`, options);

const LIST_ENDPOINT =
    '/v1/private-servers/my-private-servers?itemsPerPage=100&privateServersTab=MyPrivateServers';
// Persisted caches so the manager renders instantly and stays in sync:
// the server list plus per-server details (friends-allowed state, join link).
const SERVERS_CACHE_KEY = 'privateServersCache';
const DETAILS_CACHE_KEY = 'privateServerDetailsCache';
const RENAME_MAX_LENGTH = 50;
const EXPIRY_WARNING_DAYS = 7;
const BULK_REQUEST_DELAY_MS = 500;
const DETAILS_CONCURRENCY = 6;
const COPY_FEEDBACK_MS = 1500;

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

async function fetchServerDetails(privateServerId) {
    const response = await callRobloxApi({
        subdomain: 'games',
        endpoint: `/v1/vip-servers/${privateServerId}`,
        method: 'GET',
        noCache: true,
    });
    if (!response.ok) {
        throw new Error(`Private server details failed: ${response.status}`);
    }
    return response.json();
}

async function getServersCache() {
    try {
        const stored = await chrome.storage.local.get(SERVERS_CACHE_KEY);
        const cached = stored[SERVERS_CACHE_KEY];
        if (cached && Array.isArray(cached.servers)) return cached;
    } catch (error) {
        console.warn('RoValra: Failed to read the private server cache', error);
    }
    return null;
}

async function setServersCache(servers) {
    try {
        await chrome.storage.local.set({
            [SERVERS_CACHE_KEY]: { savedAt: Date.now(), servers },
        });
    } catch (error) {
        console.warn('RoValra: Failed to write the private server cache', error);
    }
}

async function updateCachedServerName(serverId, name) {
    try {
        const cached = await getServersCache();
        if (!cached) return;
        const servers = cached.servers.map((server) =>
            String(server.privateServerId) === String(serverId)
                ? { ...server, name }
                : server,
        );
        await setServersCache(servers);
    } catch (error) {
        console.warn('RoValra: Failed to update the private server cache', error);
    }
}

async function getDetailsCache() {
    try {
        const stored = await chrome.storage.local.get(DETAILS_CACHE_KEY);
        const cached = stored[DETAILS_CACHE_KEY];
        if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
            return cached;
        }
    } catch (error) {
        console.warn(
            'RoValra: Failed to read the private server details cache',
            error,
        );
    }
    return {};
}

async function setDetailsCache(detailsById) {
    try {
        await chrome.storage.local.set({
            [DETAILS_CACHE_KEY]: { ...detailsById },
        });
    } catch (error) {
        console.warn(
            'RoValra: Failed to write the private server details cache',
            error,
        );
    }
}

function extractApiErrorMessage(data, fallback) {
    const apiMessage = data?.errors?.[0]?.message;
    return apiMessage ? String(apiMessage) : fallback;
}

async function extractApiError(response) {
    let reason = `HTTP ${response.status}`;
    try {
        reason = extractApiErrorMessage(await response.json(), reason);
    } catch {
        // Keep the generic message when the body isn't JSON.
    }
    return reason;
}

function isExpiredServer(server, details) {
    if (details?.subscription?.expired === true) return true;
    if (!server || !server.expirationDate) return false;
    const expiration = new Date(server.expirationDate);
    return (
        !Number.isNaN(expiration.getTime()) &&
        expiration.getTime() <= Date.now()
    );
}

function setRowError(errorBox, message) {
    if (!errorBox) return;
    if (message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    } else {
        errorBox.textContent = '';
        errorBox.hidden = true;
    }
}

async function patchFriendsAllowed(privateServerId, allowed) {
    return callRobloxApi({
        subdomain: 'games',
        endpoint: `/v1/vip-servers/${privateServerId}/permissions`,
        method: 'PATCH',
        body: { friendsAllowed: allowed },
    });
}

async function patchServerName(privateServerId, name) {
    const response = await callRobloxApi({
        subdomain: 'games',
        endpoint: `/v1/vip-servers/${privateServerId}`,
        method: 'PATCH',
        body: { name },
    });
    if (!response.ok) {
        throw new Error(await extractApiError(response));
    }
}

function markRowAllowed(list, serverId) {
    const row = list.querySelector(`[data-server-id="${String(serverId)}"]`);
    if (!row) return;
    const toggle = row.querySelector('.rovalra-psm-friends-toggle');
    if (!toggle || typeof toggle.setChecked !== 'function') return;
    toggle.setChecked(true);
    toggle.disabled = false;
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
            // Rendered via textContent (not HTML), so i18next's default
            // HTML-escaping of interpolated values must be off — otherwise
            // dates like 3/25/2125 display as 3&#x2F;25&#x2F;2125.
            text = ui('expiresOn', {
                date: expiration.toLocaleDateString(),
                interpolation: { escapeValue: false },
            });
            tone = 'ok';
        }
    }

    const pill = document.createElement('span');
    pill.className = `rovalra-psm-pill rovalra-psm-pill-${tone}`;
    pill.textContent = text;
    return pill;
}

async function runBulkAllow(servers, list, onAllowed) {
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
            const response = await patchFriendsAllowed(
                server.privateServerId,
                true,
            );
            if (response.ok) {
                successCount += 1;
                markRowAllowed(list, server.privateServerId);
                if (onAllowed) onAllowed(server.privateServerId, true);
            } else {
                let reason = ui('requestFailed');
                try {
                    const errorData = await response.json();
                    reason = extractApiErrorMessage(errorData, reason);
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

    let servers = [];
    const detailsById = new Map();
    let thumbnailMap = new Map();
    let searchInput = null;
    let list = null;
    const rowControls = new Map();
    // Servers whose details request failed. Their controls stay interactive
    // so the user can retry through the actions themselves.
    const detailsFailed = new Set();
    let isRefreshing = false;

    function getDetails(serverId) {
        return detailsById.get(String(serverId)) || null;
    }

    function rememberDetails(serverId, details) {
        if (details) detailsById.set(String(serverId), details);
    }

    async function persistDetails() {
        const merged = await getDetailsCache();
        for (const [serverId, details] of detailsById) {
            merged[serverId] = details;
        }
        await setDetailsCache(merged);
    }

    function applyDetailsToRow(server, serverId, details, failed) {
        const controls = rowControls.get(String(serverId));
        if (!controls) return;
        const key = String(serverId);

        if (failed) {
            detailsFailed.add(key);
            // Status unknown: keep the controls usable instead of dead.
            if (controls.toggle) {
                controls.toggle.disabled = false;
                controls.toggle.title = ui('statusLoadFailed');
            }
            if (controls.copyButton) {
                controls.copyButton.disabled = false;
                controls.copyButton.title = ui('statusLoadFailed');
            }
            return;
        }

        detailsFailed.delete(key);
        const expired = isExpiredServer(server, details);
        const friendsAllowed = details?.permissions?.friendsAllowed === true;
        if (
            controls.toggle &&
            typeof controls.toggle.setChecked === 'function'
        ) {
            controls.toggle.setChecked(friendsAllowed);
            controls.toggle.disabled = expired;
            controls.toggle.title = expired ? ui('serverExpired') : '';
        }
        if (controls.copyButton) {
            const hasLink = Boolean(details?.link);
            controls.copyButton.disabled = expired || !hasLink;
            if (expired) {
                controls.copyButton.title = ui('serverExpired');
            } else if (!hasLink) {
                controls.copyButton.title = ui('noLinkAvailable');
            } else {
                controls.copyButton.title = '';
            }
        }
    }

    async function handleToggle(serverId, newState, toggle) {
        const controls = rowControls.get(String(serverId));
        setRowError(controls?.errorBox, null);
        toggle.disabled = true;
        try {
            const response = await patchFriendsAllowed(serverId, newState);
            if (!response.ok) {
                throw new Error(await extractApiError(response));
            }
            const previous = getDetails(serverId) || {};
            rememberDetails(serverId, {
                ...previous,
                permissions: {
                    ...(previous.permissions || {}),
                    friendsAllowed: newState,
                },
            });
            await persistDetails();
        } catch (error) {
            console.error(
                'RoValra: Failed to toggle friends allowed on a private server',
                error,
            );
            if (typeof toggle.setChecked === 'function') {
                toggle.setChecked(!newState);
            }
            setRowError(
                controls?.errorBox,
                ui('updateFailed', {
                    error: error?.message || ui('requestFailed'),
                    interpolation: { escapeValue: false },
                }),
            );
        } finally {
            const expired = isExpiredServer(
                controls?.server,
                getDetails(serverId),
            );
            toggle.disabled = expired;
        }
    }

    async function handleRename(server, nameSpan, renameInput, errorBox) {
        const serverId = server.privateServerId;
        const newName = String(renameInput.value || '')
            .trim()
            .slice(0, RENAME_MAX_LENGTH);
        if (!newName || newName === server.name) {
            renameInput.value = server.name || '';
            return;
        }
        renameInput.disabled = true;
        setRowError(errorBox, null);
        try {
            await patchServerName(serverId, newName);
            server.name = newName;
            nameSpan.textContent = newName;
            nameSpan.title = newName;
            renameInput.value = newName;
            await updateCachedServerName(serverId, newName);
        } catch (error) {
            console.error('RoValra: Failed to rename a private server', error);
            renameInput.value = server.name || '';
            setRowError(
                errorBox,
                ui('renameFailed', {
                    error: error?.message || ui('requestFailed'),
                    interpolation: { escapeValue: false },
                }),
            );
        } finally {
            renameInput.disabled = false;
        }
    }

    function flashButtonText(button, text) {
        const originalText = button.textContent;
        button.textContent = text;
        setTimeout(() => {
            button.textContent = originalText;
        }, COPY_FEEDBACK_MS);
    }

    async function handleCopyLink(serverId, copyButton) {
        const controls = rowControls.get(String(serverId));
        setRowError(controls?.errorBox, null);
        if (copyButton.disabled) return;
        let details = getDetails(serverId);
        let detailsFailed = false;
        if (!details?.link) {
            copyButton.disabled = true;
            try {
                details = await fetchServerDetails(serverId);
                rememberDetails(serverId, details);
                applyDetailsToRow(controls?.server, serverId, details, false);
                await persistDetails();
            } catch (error) {
                console.error(
                    'RoValra: Failed to load a private server link',
                    error,
                );
                detailsFailed = true;
                applyDetailsToRow(controls?.server, serverId, null, true);
            }
        }
        const link = getDetails(serverId)?.link;
        if (!link) {
            setRowError(
                controls?.errorBox,
                detailsFailed ? ui('statusLoadFailed') : ui('noLinkAvailable'),
            );
            flashButtonText(copyButton, ts('quickPlay.error'));
            return;
        }
        try {
            await navigator.clipboard.writeText(link);
            flashButtonText(copyButton, ts('quickPlay.copied'));
        } catch (error) {
            console.error(
                'RoValra: Failed to copy a private server link',
                error,
            );
            setRowError(
                controls?.errorBox,
                ui('updateFailed', {
                    error: error?.message || ui('requestFailed'),
                    interpolation: { escapeValue: false },
                }),
            );
        }
    }

    function createRow(server) {
        const serverId = server.privateServerId;
        const row = document.createElement('div');
        row.className = 'rovalra-psm-row';
        row.dataset.serverId = String(serverId);

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

        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'rovalra-psm-rename-input';
        renameInput.placeholder = ui('renamePlaceholder');
        renameInput.setAttribute('aria-label', ui('renamePlaceholder'));
        renameInput.maxLength = RENAME_MAX_LENGTH;
        renameInput.value = server.name || '';

        const errorBox = document.createElement('div');
        errorBox.className = 'rovalra-psm-row-error';
        errorBox.hidden = true;

        renameInput.addEventListener('change', () => {
            handleRename(server, name, renameInput, errorBox);
        });

        info.append(nameRow, renameInput, errorBox);

        const actions = document.createElement('div');
        actions.className = 'rovalra-psm-actions';

        const toggleRow = document.createElement('div');
        toggleRow.className = 'rovalra-psm-toggle-row';

        const toggleLabel = document.createElement('span');
        toggleLabel.textContent = ts('privateServer.friendsAllowed');

        const knownDetails = getDetails(serverId);
        const toggle = createToggle({
            checked: knownDetails?.permissions?.friendsAllowed === true,
            onChange: (newState) => {
                handleToggle(serverId, newState, toggle);
            },
        });
        toggle.classList.add('rovalra-psm-friends-toggle');
        toggle.setAttribute(
            'aria-label',
            ts('privateServer.friendsAllowed'),
        );

        const copyButton = createButton(ts('quickPlay.copyLink'), 'secondary', {
            onClick: () => {
                handleCopyLink(serverId, copyButton);
            },
        });
        copyButton.classList.add('rovalra-psm-copy-button');

        toggleRow.append(toggleLabel, toggle);
        actions.append(toggleRow, copyButton);

        row.append(thumbWrap, info, actions);
        rowControls.set(String(serverId), {
            toggle,
            copyButton,
            errorBox,
            server,
        });
        if (knownDetails) {
            applyDetailsToRow(server, serverId, knownDetails, false);
        } else {
            toggle.disabled = true;
            copyButton.disabled = true;
        }
        return row;
    }

    function renderRows() {
        if (!list) return;
        rowControls.clear();
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        list.innerHTML = '';

        const visible = servers.filter((server) => {
            if (!query) return true;
            return String(server.name || '')
                .toLowerCase()
                .includes(query);
        });

        if (!visible.length) {
            appendStatus(list, servers.length ? ui('noMatches') : ui('empty'));
            return;
        }

        visible.forEach((server) => {
            list.appendChild(createRow(server));
        });
    }

    function buildInterface() {
        container.innerHTML = '';

        const toolbar = document.createElement('div');
        toolbar.className = 'rovalra-psm-toolbar';

        searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'rovalra-psm-search';
        searchInput.placeholder = ui('searchPlaceholder');
        searchInput.setAttribute('aria-label', ui('searchPlaceholder'));
        searchInput.addEventListener('input', renderRows);

        const refreshButton = createButton(ui('refresh'), 'secondary', {
            onClick: () => {
                refreshServers();
            },
        });

        const bulkButton = createButton(ui('bulkButton'), 'primary', {
            onClick: () => {
                showConfirmationPrompt({
                    title: ui('bulkAllowTitle'),
                    message: ui('bulkAllowMessage', { count: servers.length }),
                    confirmText: ui('bulkAllowConfirm'),
                    confirmType: 'primary',
                    onConfirm: () => {
                        runBulkAllow(servers, list, (serverId, allowed) => {
                            const previous = getDetails(serverId) || {};
                            rememberDetails(serverId, {
                                ...previous,
                                permissions: {
                                    ...(previous.permissions || {}),
                                    friendsAllowed: allowed,
                                },
                            });
                            persistDetails();
                        });
                    },
                });
            },
        });

        toolbar.append(searchInput, refreshButton, bulkButton);

        list = document.createElement('div');
        list.className = 'rovalra-psm-list';
        container.append(toolbar, list);
    }

    async function loadThumbnails() {
        if (!servers.length) return;
        try {
            thumbnailMap = await fetchThumbnails(
                servers.map((server) => ({ id: server.universeId })),
                'GameIcon',
                '150x150',
            );
        } catch (error) {
            console.warn('RoValra: Failed to load private server icons', error);
            return;
        }
        if (!list) return;
        const rows = list.querySelectorAll('[data-server-id]');
        rows.forEach((row) => {
            const current = servers.find(
                (server) =>
                    String(server.privateServerId) === row.dataset.serverId,
            );
            if (!current) return;
            const thumbData = thumbnailMap.get(Number(current.universeId));
            if (!thumbData || !thumbData.imageUrl) return;
            const image = row.querySelector('.rovalra-psm-thumb img');
            if (image && !image.src) image.src = thumbData.imageUrl;
        });
    }

    async function loadAllDetails() {
        const queue = [...servers];
        async function worker() {
            while (queue.length) {
                const server = queue.shift();
                const serverId = server.privateServerId;
                try {
                    const details = await fetchServerDetails(serverId);
                    rememberDetails(serverId, details);
                    applyDetailsToRow(server, serverId, details, false);
                } catch (error) {
                    console.warn(
                        'RoValra: Failed to load private server details',
                        error,
                    );
                    applyDetailsToRow(server, serverId, null, true);
                }
            }
        }
        const workerCount = Math.min(DETAILS_CONCURRENCY, queue.length);
        const workers = [];
        for (let i = 0; i < workerCount; i++) {
            workers.push(worker());
        }
        await Promise.all(workers);
        await persistDetails();
    }

    async function refreshServers() {
        if (isRefreshing) return;
        isRefreshing = true;
        try {
            // Always revalidate in the background so creations, deletions and
            // external changes are picked up and the cache stays in sync.
            const freshServers = await fetchAllServers();
            servers = freshServers;
            await setServersCache(freshServers);
            if (!list) buildInterface();
            renderRows();
            loadThumbnails();
            await loadAllDetails();
        } catch (error) {
            console.warn('RoValra: Failed to load private servers', error);
            if (!list) {
                container.innerHTML = '';
                appendStatus(container, ui('loadFailed'));
            }
        } finally {
            isRefreshing = false;
        }
    }

    // Render instantly from the local cache when available, then revalidate.
    try {
        const [cachedServers, cachedDetails] = await Promise.all([
            getServersCache(),
            getDetailsCache(),
        ]);
        if (cachedServers && cachedServers.servers.length) {
            servers = cachedServers.servers;
            for (const [serverId, details] of Object.entries(cachedDetails)) {
                rememberDetails(serverId, details);
            }
            buildInterface();
            renderRows();
            loadThumbnails();
        } else {
            appendStatus(container, ui('loading'));
        }
    } catch (error) {
        console.warn('RoValra: Failed to read the private server cache', error);
        appendStatus(container, ui('loading'));
    }

    await refreshServers();
}
