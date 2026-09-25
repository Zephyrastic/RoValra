import { callRobloxApiJson } from '../../core/api.js';
import { observeElement, observeChildren } from '../../core/observer.js';
import { getUserIdFromUrl, getGroupIdFromUrl } from '../../core/idExtractor.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import {
    getJoinDate,
    getJoinDateFailure,
    clearJoinDateFailure,
} from './groupFilters.js';
import { ts } from '../../core/locale/i18n.js';

let rolesPromise = null;
let lastUserId = null;

async function getGroupRoles(userId) {
    if (rolesPromise && lastUserId === userId) return rolesPromise;

    lastUserId = userId;
    rolesPromise = (async () => {
        try {
            const res = await callRobloxApiJson({
                subdomain: 'groups',
                endpoint: `/v1/users/${userId}/groups/roles?includeLocked=true`,
            });
            return new Map(
                res?.data?.map((item) => [item.group.id, item.role.name]) || [],
            );
        } catch (e) {
            console.error('RoValra: Failed to fetch group roles', e);
            rolesPromise = null;
            return new Map();
        }
    })();

    return rolesPromise;
}

export function init() {
    const userId = getUserIdFromUrl();
    if (!userId) return;

    chrome.storage.local.get(
        { groupRoleEnabled: true, groupJoinedDateEnabled: true },
        (settings) => {
            const groupRoleEnabled = settings.groupRoleEnabled;
            const groupJoinedDateEnabled = settings.groupJoinedDateEnabled;

            const itemSelector = [
                '[class*="-carousel"] [id="collection-carousel-item"] .base-tile a[href*="/communities/"]',
                '[class*="-carousel"] [class*="-carouselItem"] .base-tile a[href*="/communities/"]',
            ].join(', ');

            observeElement(
                itemSelector,
                async (groupLink) => {
                    if (groupLink.dataset.rovalraGroupRoleProcessed) return;
                    groupLink.dataset.rovalraGroupRoleProcessed = 'true';

                    const href = groupLink.getAttribute('href');
                    const groupIdString = getGroupIdFromUrl(href);
                    if (!groupIdString) return;

                    const groupId = parseInt(groupIdString, 10);

                    const [rolesMap, joinedDate] = await Promise.all([
                        groupRoleEnabled
                            ? getGroupRoles(userId)
                            : Promise.resolve(null),
                        groupJoinedDateEnabled
                            ? getJoinDate(groupId, userId)
                            : Promise.resolve(null),
                    ]);

                    const metadataContainer = groupLink.querySelector(
                        '.base-tile-metadata > div',
                    );
                    if (!metadataContainer) return;

                    const checkAndFixPlacement = () => {
                        const extCommunityRole = groupLink.querySelector(
                            '.user-community-role',
                        );
                        const extJoinDate =
                            groupLink.querySelector('.group-joined-date');
                        const roJoin = groupLink.querySelector(
                            '.rovalra-group-joined',
                        );
                        const roRole = groupLink.querySelector(
                            '.rovalra-group-role',
                        );

                        if (groupRoleEnabled && extCommunityRole) {
                            extCommunityRole.remove();
                        }
                        if (roJoin && extJoinDate) {
                            extJoinDate.remove();
                        }

                        const currentRole = groupLink.querySelector(
                            '.rovalra-group-role, .user-community-role',
                        );
                        if (
                            currentRole &&
                            roJoin &&
                            currentRole.nextElementSibling !== roJoin
                        ) {
                            currentRole.after(roJoin);
                        }
                    };
                    observeChildren(groupLink, checkAndFixPlacement);
                    checkAndFixPlacement();

                    const hasRosealRole = groupLink.querySelector(
                        '.user-community-role',
                    );
                    if (groupRoleEnabled && rolesMap && !hasRosealRole) {
                        const roleName = rolesMap.get(groupId);
                        if (roleName) {
                            let roleDiv = metadataContainer.querySelector(
                                '.rovalra-group-role',
                            );
                            if (!roleDiv) {
                                roleDiv = document.createElement('div');
                                roleDiv.className = 'rovalra-group-role';
                                roleDiv.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                });
                                metadataContainer.appendChild(roleDiv);
                            }
                            roleDiv.textContent = roleName;
                            Object.assign(roleDiv.style, {
                                color: 'var(--rovalra-secondary-text-color)',
                            });
                        }
                    }

                    const ensureJoinDiv = () => {
                        let joinDiv = metadataContainer.querySelector(
                            '.rovalra-group-joined',
                        );
                        if (!joinDiv) {
                            joinDiv = document.createElement('div');
                            joinDiv.className = 'rovalra-group-joined';
                            joinDiv.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            });
                            metadataContainer.appendChild(joinDiv);
                        }
                        joinDiv.textContent = `${ts('groups.joinedLabel')} `;
                        Object.assign(joinDiv.style, {
                            color: 'var(--rovalra-secondary-text-color)',
                            fontSize: '14px',
                            marginTop: '2px',
                        });

                        joinDiv.style.setProperty(
                            'white-space',
                            'normal',
                            'important',
                        );
                        joinDiv.style.setProperty(
                            'text-overflow',
                            'clip',
                            'important',
                        );
                        joinDiv.style.setProperty(
                            'overflow',
                            'visible',
                            'important',
                        );
                        return joinDiv;
                    };

                    const joinFailureTitle = (failure) =>
                        ts('groups.joinDateError', {
                            status: failure?.status ?? ts('groups.unknown'),
                            interpolation: { escapeValue: false },
                        });

                    if (joinedDate) {
                        const joinDiv = ensureJoinDiv();

                        if (joinedDate.getTime() > 0) {
                            joinDiv.appendChild(
                                createInteractiveTimestamp(joinedDate),
                            );
                        } else {
                            const unknownSpan = document.createElement('span');
                            unknownSpan.textContent = ts('groups.unknown');
                            joinDiv.appendChild(unknownSpan);
                        }
                    } else if (groupJoinedDateEnabled) {
                        // The lookup failed: show a retry affordance instead
                        // of nothing so the row explains itself and can
                        // recover without a page reload.
                        const failure = getJoinDateFailure(groupId, userId);
                        if (failure) {
                            const joinDiv = ensureJoinDiv();
                            const retry = document.createElement('button');
                            retry.type = 'button';
                            retry.className = 'rovalra-group-joined-retry';
                            retry.textContent = ts('groups.retry');
                            retry.title = joinFailureTitle(failure);
                            Object.assign(retry.style, {
                                background: 'none',
                                border: 'none',
                                padding: '0',
                                margin: '0',
                                color: 'inherit',
                                font: 'inherit',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                            });
                            retry.addEventListener('click', async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (retry.disabled) return;
                                retry.disabled = true;
                                clearJoinDateFailure(groupId, userId);
                                const fresh = await getJoinDate(
                                    groupId,
                                    userId,
                                );
                                if (fresh && fresh.getTime() > 0) {
                                    joinDiv.textContent = `${ts('groups.joinedLabel')} `;
                                    joinDiv.appendChild(
                                        createInteractiveTimestamp(fresh),
                                    );
                                } else {
                                    retry.disabled = false;
                                    retry.title = joinFailureTitle(
                                        getJoinDateFailure(groupId, userId),
                                    );
                                }
                            });
                            joinDiv.appendChild(retry);
                        }
                    }

                    checkAndFixPlacement();
                },
                { multiple: true },
            );
        },
    );
}
