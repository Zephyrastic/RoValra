import { ts } from '../../core/locale/i18n.js';
import { parseUntrustedMarkdown } from '../../core/utils/markdown.js';
import { createPill } from '../../core/ui/general/pill.js';
import DOMPurify from 'dompurify';

const ui = (key, options) => ts(`settings.ui.whatsNew.${key}`, options);

// The GitHub Releases API is CORS-open (access-control-allow-origin: *), so
// the background's fetchJson handler can pull it without any RoValra backend
// or extra host permissions.
const RELEASES_URL =
    'https://api.github.com/repos/Zephyrastic/RoValra-Firefox-Port/releases?per_page=15';
const CACHE_STORAGE_KEY = 'whatsNewReleasesCache';
const CACHE_TTL_MS = 60 * 60 * 1000;

let moduleCache = null;
let inflightRequest = null;

function sanitizeReleases(raw) {
    if (!Array.isArray(raw)) return [];

    const releases = raw
        .filter(
            (release) =>
                release &&
                typeof release === 'object' &&
                release.draft !== true,
        )
        .map((release) => ({
            tag_name:
                typeof release.tag_name === 'string' ? release.tag_name : '',
            name: typeof release.name === 'string' ? release.name : '',
            published_at:
                typeof release.published_at === 'string'
                    ? release.published_at
                    : '',
            body: typeof release.body === 'string' ? release.body : '',
            html_url:
                typeof release.html_url === 'string' ? release.html_url : '',
            prerelease: release.prerelease === true,
        }));

    releases.sort(
        (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
    );
    return releases;
}

function parseVersion(tag) {
    const cleaned = String(tag || '').replace(/^v/, '');
    const parts = cleaned.split('.').map((part) => Number.parseInt(part, 10));
    if (!parts.length || parts.some((part) => Number.isNaN(part))) return null;
    return parts;
}

function isNewerVersion(candidate, current) {
    const candidateParts = parseVersion(candidate);
    const currentParts = parseVersion(current);
    if (!candidateParts || !currentParts) return false;

    const length = Math.max(candidateParts.length, currentParts.length);
    for (let i = 0; i < length; i++) {
        const candidatePart = candidateParts[i] || 0;
        const currentPart = currentParts[i] || 0;
        if (candidatePart > currentPart) return true;
        if (candidatePart < currentPart) return false;
    }
    return false;
}

function isFreshCache(cache) {
    return Boolean(
        cache &&
            Array.isArray(cache.releases) &&
            typeof cache.fetchedAt === 'number' &&
            Date.now() - cache.fetchedAt < CACHE_TTL_MS,
    );
}

function getCurrentVersion() {
    try {
        return chrome.runtime.getManifest().version;
    } catch {
        return '';
    }
}

async function fetchReleasesFromGitHub() {
    const response = await chrome.runtime.sendMessage({
        action: 'fetchJson',
        url: RELEASES_URL,
    });
    if (!response) {
        throw new Error('No response from the background fetch handler.');
    }
    if (response.error) throw new Error(response.error);
    return sanitizeReleases(response.data);
}

async function loadReleases() {
    const stored = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const cached = stored[CACHE_STORAGE_KEY];
    if (isFreshCache(cached)) {
        moduleCache = cached;
        return cached.releases;
    }

    try {
        const releases = await fetchReleasesFromGitHub();
        moduleCache = { fetchedAt: Date.now(), releases };
        await chrome.storage.local.set({
            [CACHE_STORAGE_KEY]: moduleCache,
        });
        return releases;
    } catch (error) {
        // A stale cache still beats showing nothing when GitHub is down.
        if (cached && Array.isArray(cached.releases)) {
            moduleCache = cached;
            return cached.releases;
        }
        throw error;
    }
}

export async function getWhatsNewReleases() {
    if (isFreshCache(moduleCache)) return moduleCache.releases;
    if (inflightRequest) return inflightRequest;

    inflightRequest = loadReleases().finally(() => {
        inflightRequest = null;
    });
    return inflightRequest;
}

function applySidebarBadge(updateAvailable) {
    const link = document.querySelector(
        '#unified-menu li[data-static-id="whatsNew"] a.menu-option-content',
    );
    if (!link) return;

    const existing = link.querySelector('.rovalra-whatsnew-sidebar-badge');
    if (updateAvailable && !existing) {
        const badge = document.createElement('span');
        badge.className = 'rovalra-whatsnew-sidebar-badge';
        badge.textContent = '!';
        badge.title = ui('updateBadge');
        link.appendChild(badge);
    } else if (!updateAvailable && existing) {
        existing.remove();
    }
}

// Best-effort sidebar badge refresh; runs on every settings tab render and
// is cheap after the first fetch thanks to the module + storage caches.
export async function refreshWhatsNewSidebarBadge() {
    try {
        const releases = await getWhatsNewReleases();
        const latest = releases[0];
        applySidebarBadge(
            Boolean(latest && isNewerVersion(latest.tag_name, getCurrentVersion())),
        );
    } catch (error) {
        console.warn('RoValra: Failed to check for a What\'s New update', error);
    }
}

function isGitHubUrl(value) {
    try {
        return new URL(value).origin === 'https://github.com';
    } catch {
        return false;
    }
}

function formatPublishedDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString();
}

function renderReleaseCard(release) {
    const card = document.createElement('article');
    card.className = 'rovalra-changelog-card';

    const header = document.createElement('div');
    header.className = 'rovalra-changelog-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'rovalra-changelog-title-group';

    const title = document.createElement('h3');
    title.className = 'rovalra-changelog-title';
    title.textContent = release.name || release.tag_name || ui('untitled');

    const dates = document.createElement('div');
    dates.className = 'rovalra-changelog-dates';

    if (release.published_at) {
        const publishedDate = document.createElement('span');
        publishedDate.textContent = `${ui('published')}: ${formatPublishedDate(release.published_at)}`;
        dates.appendChild(publishedDate);
    }

    if (release.prerelease) {
        const prereleaseLabel = document.createElement('span');
        prereleaseLabel.textContent = ui('prerelease');
        dates.appendChild(prereleaseLabel);
    }

    titleGroup.append(title, dates);
    header.appendChild(titleGroup);

    if (isGitHubUrl(release.html_url)) {
        const link = document.createElement('a');
        link.className = 'rovalra-whatsnew-link';
        link.href = release.html_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = ui('viewOnGitHub');
        header.appendChild(link);
    }

    const body = document.createElement('div');
    body.className = 'rovalra-changelog-body';
    const rendered = parseUntrustedMarkdown(release.body, {
        fullMarkdown: true,
        githubMentions: true,
    });
    if (rendered) {
        body.innerHTML = DOMPurify.sanitize(rendered);
    } else {
        body.textContent = ui('noNotes');
    }

    card.append(header, body);
    return card;
}

function appendStatus(container, text) {
    const status = document.createElement('div');
    status.className = 'rovalra-changelog-status';
    status.textContent = text;
    container.appendChild(status);
}

export async function renderWhatsNew(container) {
    container.innerHTML = '';
    appendStatus(container, ui('loading'));

    try {
        const releases = await getWhatsNewReleases();
        container.innerHTML = '';

        if (!releases.length) {
            appendStatus(container, ui('empty'));
            return;
        }

        const status = document.createElement('div');
        status.className = 'rovalra-whatsnew-status';

        const latest = releases[0];
        const currentVersion = getCurrentVersion();
        if (isNewerVersion(latest.tag_name, currentVersion)) {
            const updatePill = createPill(
                ui('updateAvailable', {
                    version: String(latest.tag_name).replace(/^v/, ''),
                }),
                null,
                { size: 'small' },
            );
            updatePill.classList.add('rovalra-whatsnew-update-pill');
            status.appendChild(updatePill);
        } else if (currentVersion) {
            const upToDate = document.createElement('span');
            upToDate.className = 'rovalra-whatsnew-up-to-date';
            upToDate.textContent = ui('upToDate', { version: currentVersion });
            status.appendChild(upToDate);
        }

        container.appendChild(status);

        releases.forEach((release) => {
            container.appendChild(renderReleaseCard(release));
        });
    } catch (error) {
        console.warn('RoValra: Failed to load What\'s New releases', error);
        container.innerHTML = '';
        appendStatus(container, ui('loadFailed'));
    }
}
