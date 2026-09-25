import { getAssets } from '../../core/assets.js';
import { getRegionData, loadDatacenterMap } from '../../core/regions.js';
import { init as initBulkUnblock } from './bulkUnblock.js';
import { renderWhatsNew, refreshWhatsNewSidebarBadge } from './whatsNew.js';
import { renderPrivateServerManager } from './privateServerManager.js';
import { renderPerformance } from './performance.js';
import { observeElement } from '../../core/observer.js';
import { generateSingleSettingHTML } from '../../core/settings/generateSettings.js';
import { SETTINGS_CONFIG } from '../../core/settings/settingConfig.js';
import {
    exportProfileNotes,
    exportSettings,
    importProfileNotes,
    importSettings,
} from '../../core/settings/portSettings.js';
import {
    initSettings,
    initializeSettingsEventListeners,
    updateConditionalSettingsVisibility,
    buildSettingsKey,
    getCurrentUserTierSync,
    syncDonatorTier,
} from '../../core/settings/handlesettings.js';
import {
    addCustomButton,
    addPopoverButton,
} from '../../core/settings/ui/settingsbutton.js';
import { checkRoValraPage } from '../../core/settings/ui/page.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { safeHtml } from '../../core/packages/dompurify';
import DOMPurify from 'dompurify';
import { BADGE_CONFIG } from '../../core/configs/badges.js';
import { t, ts } from '../../core/locale/i18n.js';
import {
    CONTRIBUTOR_USER_IDS,
    CREATOR_USER_ID,
    TRANSLATOR_USER_IDS,
} from '../../core/configs/userIds.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { parseMarkdown } from '../../core/utils/markdown.js';
import { getCurrentTheme, THEME_CONFIG } from '../../core/theme.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import {
    getUserSettings,
    updateUserSettingViaApi,
} from '../../core/donators/settingHandler.js';
import { createPill } from '../../core/ui/general/pill.js';
import { getUserProfileData } from '../../core/apis/users.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import {
    getActiveModeration,
    getModerationStatusLabel,
} from '../../core/moderationStatus.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { createShimmerBlock } from '../../core/ui/shimmer.js';
import { createButton } from '../../core/ui/buttons.js';
import { ChangeIcon, Icon } from '../../core/ui/buildericon.js';
import { CUSTOM_ADDED_TAGS } from '../../core/utils/purifyCfg.js';
import { OTHER_CONTRIBUTIONS } from '../../core/configs/otherContributions.js';

const assets = getAssets();
const ui = (key, options) => ts(`settings.ui.${key}`, options);
const CREDITS_USER_IDS = [
    ...new Set([
        CREATOR_USER_ID,
        ...CONTRIBUTOR_USER_IDS,
        ...TRANSLATOR_USER_IDS,
    ]),
];
let REGIONS = {};

const DONATOR_PERKS_UNIVERSE_ID = '9452973012';
const DONATOR_PERKS_GAME_URL =
    'https://www.roblox.com/games/store-section/' + DONATOR_PERKS_UNIVERSE_ID;
const DONATOR_PERKS_FALLBACK_ONSALE_URL =
    'https://www.roblox.com/catalog?taxonomy=2a2rf9qyeTd8W5iegK2Prc&CreatorName=Valra&CreatorType=Group&salesTypeFilter=1';
const CUSTOM_PROFILE_BADGE_ITEM_URL =
    'https://www.roblox.com/catalog/82011134345292/4000';
const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/NotValra';
const GITHUB_SPONSOR_BADGE_IMAGE_URL =
    'https://www.rovalra.com/badges/icons/github.webp';
const GITHUB_SPONSOR_TRANSPARENT_PIXEL =
    'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const ROVALRA_DISCORD_URL = 'https://discord.gg/GHd5cSKJRk';
const CUSTOM_PROFILE_BADGE_CONFIRMATION_COOLDOWN_SECONDS = 5;
let requestedDonatorGameUnblock = false;
let requestedDonatorGameUnblockChecked = false;
let donatorGameUnblockConsentId = 0;
let parentAttchedToAccount = false;
let parentAttchedToAccountChecked = false;

const RESTRICTION_LEVELS = [
    'standing.levels.none',
    'standing.levels.limited',
    'standing.levels.veryLimited',
    'standing.levels.atRisk',
    'standing.levels.suspended',
];
const APPEAL_STATUSES = [
    'standing.appealStatuses.notAppealed',
    'standing.appealStatuses.pending',
    'standing.appealStatuses.denied',
    'standing.appealStatuses.accepted',
];
const ACCOUNT_STANDING_LEVELS = [
    { labelKey: 'levels.allGood', color: '#23a55a' },
    { labelKey: 'levels.limited', color: '#f0b232' },
    { labelKey: 'levels.veryLimited', color: '#f26522' },
    { labelKey: 'levels.atRisk', color: '#f23f43' },
    { labelKey: 'levels.suspended', color: '#8b0000' },
];

let standingCache = null;
let topDonatorsCache = null;
let githubSponsorsCache = null;

document.addEventListener('rovalra:moderationStatusUpdated', (event) => {
    standingCache = event.detail?.data || null;

    const standingCard = document.querySelector(
        '.rovalra-account-standing-card',
    );
    if (standingCard && standingCache) {
        updateAccountStandingUI(
            standingCard,
            standingCache,
            ACCOUNT_STANDING_LEVELS,
        );
    }
});

async function openDonatorPerksDonationUrl() {
    let canPlayUniverse = false;
    let canPlayUniverseReason = 'Unknown';
    const btn = document.querySelector(
        '#rovalra-donator-perks-donation-button',
    );

    btn.dataset.rovalraDonatorPerksDonationButtonLoading = true;

    async function openPopup(url) {
        try {
            const popup = window.open('about:blank', '_blank');
            if (popup) popup.opener = null;

            if (popup) {
                popup.location.href = url;
            } else {
                window.location.href = url;
            }
        } catch (error) {
            console.warn('RoValra: Failed to open donation URL', error);
            window.location.href = url;
        }
    }

    async function overlayUnblockGame() {
        const loadingOverlay = createOverlay({
            title: ui('parentRequest.sendingTitle'),
            bodyContent: ui('common.pleaseWait'),
            showLogo: true,
        });
        try {
            await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/child-requests-api/v1/send-request-to-all-parents',
                method: 'POST',
                body: {
                    requestType: 'ManageExperience',
                    requestDetails: {
                        universeId: String(DONATOR_PERKS_UNIVERSE_ID),
                        experienceManagementAction: 'Approve',
                    },
                },
            });

            const universeDetailsRequest = await callRobloxApi({
                subdomain: 'games',
                endpoint: '/v1/games?universeIds=' + DONATOR_PERKS_UNIVERSE_ID,
                method: 'GET',
            });
            const universeDetails = (await universeDetailsRequest.json())
                .data[0];

            loadingOverlay.close();

            const requestSentOverlay = createOverlay({
                title: ui('parentRequest.sentTitle'),
                bodyContent:
                    ui('parentRequest.sentBody') +
                    (universeDetailsRequest.ok
                        ? `<br />${ui('parentRequest.experienceName')}: <b>` +
                          DOMPurify.sanitize(universeDetails.name) +
                          '</b>'
                        : ''),
                actions: [
                    createButton(ui('common.ok'), 'secondary', {
                        onClick: () => {
                            requestSentOverlay.close();
                        },
                    }),
                ],
                showLogo: true,
            });

            requestedDonatorGameUnblockChecked = false;
        } catch (error) {
            console.warn('[RoValra Unblock Request] Error:', error);
            loadingOverlay.close();
            const requestFailedOverlay = createOverlay({
                title: ui('parentRequest.sendFailedTitle'),
                bodyContent: ui('parentRequest.sendFailedBody'),
                actions: [
                    createButton(ui('common.ok'), 'secondary', {
                        onClick: () => {
                            requestFailedOverlay.close();
                        },
                    }),
                ],
                showLogo: true,
            });
        }
        btn.dataset.rovalraDonatorPerksDonationButtonLoading = false;
    }

    async function overlayCancelRequest(
        consentId = donatorGameUnblockConsentId,
    ) {
        btn.dataset.rovalraDonatorPerksDonationButtonLoading = true;
        const loadingOverlay = createOverlay({
            title: ui('parentRequest.cancelingTitle'),
            bodyContent: ui('common.pleaseWait'),
            showLogo: true,
        });
        try {
            await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/child-requests-api/v1/cancel-consent-request',
                method: 'POST',
                body: {
                    consentId,
                },
            });

            loadingOverlay.close();

            const cancelRequestSentOverlay = createOverlay({
                title: ui('parentRequest.canceledTitle'),
                bodyContent: ui('parentRequest.canceledBody'),
                actions: [
                    createButton(ui('common.ok'), 'secondary', {
                        onClick: () => {
                            cancelRequestSentOverlay.close();
                        },
                    }),
                ],
                showLogo: true,
            });

            requestedDonatorGameUnblockChecked = false;
        } catch {
            loadingOverlay.close();
            const cancelRequestFailedOverlay = createOverlay({
                title: ui('parentRequest.cancelFailedTitle'),
                bodyContent: ui('parentRequest.cancelFailedBody'),
                actions: [
                    createButton(ui('common.ok'), 'secondary', {
                        onClick: () => {
                            cancelRequestFailedOverlay.close();
                        },
                    }),
                ],
                showLogo: true,
            });
        }
        btn.dataset.rovalraDonatorPerksDonationButtonLoading = false;
    }

    try {
        const canPlayUniverseRequest = (
            await callRobloxApiJson({
                subdomain: 'games',
                endpoint:
                    '/v1/games/multiget-playability-status?universeIds=' +
                    DONATOR_PERKS_UNIVERSE_ID,
                method: 'GET',
            })
        )[0];
        canPlayUniverse = canPlayUniverseRequest.isPlayable;
        canPlayUniverseReason = canPlayUniverseRequest.playabilityStatus;
    } catch (error) {
        console.warn(
            'RoValra: Failed to get playability status of donation universe',
            error,
        );
    }

    try {
        if (
            !parentAttchedToAccountChecked &&
            !parentAttchedToAccount &&
            !canPlayUniverse &&
            canPlayUniverseReason ==
                'ContextualPlayabilityRequireParentApproval'
        ) {
            const approveExperienceRecourse = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint:
                    '/access-management/v1/upsell-feature-access?featureName=CanApproveExperience&extraParameters=W10=',
                method: 'GET',
            });
            parentAttchedToAccountChecked = true;
            parentAttchedToAccount =
                approveExperienceRecourse.recourse.includes('ParentConsent');
        }
    } catch (error) {
        console.warn(
            'RoValra: Failed to see if there were any parents linked to account for game unblock overlay',
            error,
        );
    }

    try {
        if (parentAttchedToAccount && !requestedDonatorGameUnblockChecked) {
            const consentsPending = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint:
                    '/parental-controls-api/v1/parental-controls/consents?consentStatus=Pending&childUserId=' +
                    (await getAuthenticatedUserId()),
                method: 'GET',
            });

            requestedDonatorGameUnblock = consentsPending.consents.some(
                (consent) =>
                    consent.consentType === 'ManageExperience' &&
                    consent.consentData.experienceManagementAction ===
                        'Approve' &&
                    consent.consentData.universeId ===
                        String(DONATOR_PERKS_UNIVERSE_ID),
            );

            requestedDonatorGameUnblockChecked = true;

            if (requestedDonatorGameUnblock) {
                donatorGameUnblockConsentId = consentsPending.consents.find(
                    (consent) =>
                        consent.consentType === 'ManageExperience' &&
                        consent.consentData.experienceManagementAction ===
                            'Approve' &&
                        consent.consentData.universeId ===
                            String(DONATOR_PERKS_UNIVERSE_ID),
                ).id;
            } else donatorGameUnblockConsentId = 0;
        }
    } catch (error) {
        console.warn('RoValra: Failed to get parent requests of a user', error);
    }

    if (
        canPlayUniverse == false &&
        canPlayUniverseReason == 'ContextualPlayabilityRequireParentApproval' &&
        parentAttchedToAccount
    ) {
        showConfirmationPrompt({
            title: ui('donation.parentApprovalTitle'),
            message: ui('donation.parentApprovalMessage'),
            confirmText: ui('parentRequest.sendUnblock'),
            confirmType: 'primary',
            cancelText: ui('donation.useMarketplace'),
            cancelType: 'secondary',
            onConfirm: !requestedDonatorGameUnblock
                ? overlayUnblockGame
                : () => {
                      btn.dataset.rovalraDonatorPerksDonationButtonLoading = false;
                      const alreadyRequestedOverlay = createOverlay({
                          title: ui('parentRequest.alreadyRequestedTitle'),
                          bodyContent: ui('parentRequest.alreadyRequestedBody'),
                          actions: [
                              createButton(ui('common.cancel'), 'alert', {
                                  onClick: () => {
                                      alreadyRequestedOverlay.close();
                                      overlayCancelRequest();
                                  },
                              }),
                              createButton(ui('common.okay'), 'primary', {
                                  onClick: () => {
                                      alreadyRequestedOverlay.close();
                                  },
                              }),
                          ],
                          showLogo: true,
                      });
                  },
            onCancel: () => {
                btn.dataset.rovalraDonatorPerksDonationButtonLoading = false;
                openPopup(DONATOR_PERKS_FALLBACK_ONSALE_URL);
            },
            onCloseBtn: () => {
                btn.dataset.rovalraDonatorPerksDonationButtonLoading = false;
            },
            closeBtnCallsCancel: false,
        });
    } else {
        btn.dataset.rovalraDonatorPerksDonationButtonLoading = false;
        openPopup(
            canPlayUniverse
                ? DONATOR_PERKS_GAME_URL
                : DONATOR_PERKS_FALLBACK_ONSALE_URL,
        );
    }
}

function renderDonatorPerksDonationButton(container = document) {
    const holder = container.querySelector(
        '#rovalra-donator-perks-donation-button-holder',
    );
    if (!holder || holder.dataset.rovalraDonationButtonRendered === 'true')
        return;

    const spinner = createSpinner({
        className: 'rovalra-donator-perks-donation-btn-spinner',
    });
    const text = document.createElement('span');
    text.classList.add('rovalra-donator-perks-donation-btn-content');
    text.textContent = ui('donation.donateRobux');

    holder.dataset.rovalraDonationButtonRendered = 'true';
    holder.replaceChildren(
        createSquareButton({
            content: [text, spinner],
            id: 'rovalra-donator-perks-donation-button',
            onClick: openDonatorPerksDonationUrl,
            width: 'auto',
            height: 'height-1000',
            paddingX: 'padding-x-medium',
            radius: 'radius-medium',
            disableTextTruncation: true,
        }),
    );
}

function openCustomProfileBadgePurchaseOverlay() {
    const body = document.createElement('div');
    body.innerHTML = `
        <p>${ui('profileBadge.purchaseIntro')}</p>
        <p>${ui('profileBadge.createTicket')}</p>
        <p>${ui('profileBadge.provideDetails')}</p>
        <p>${ui('profileBadge.countsTowardTier')}</p>
        <p>${ui('profileBadge.visibility')}</p>
        <div style="margin: 18px 0; padding: 12px 14px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.35)); border-left: 4px solid var(--rovalra-theme-discordLink, #5865f2); border-radius: 6px; background: var(--rovalra-container-background-color, rgba(0,0,0,0.12));">
            <strong style="display: block; margin-bottom: 8px; color: var(--rovalra-main-text-color);">${ui('profileBadge.imageRequirements')}</strong>
            <ul style="margin: 0; padding-left: 20px;">
                <li>${ui('profileBadge.webpRequirement')}</li>
                <li>${ui('profileBadge.noRobloxBadges')}</li>
                <li>${ui('profileBadge.noOfficialRoValraBadges')}</li>
                <li>${ui('profileBadge.followTerms')}</li>
            </ul>
        </div>
        <p><a href="${ROVALRA_DISCORD_URL}" target="_blank" rel="noopener noreferrer" style="color: var(--rovalra-theme-discordLink, #5865f2); font-weight: 700; text-decoration: underline; text-underline-offset: 2px;">${ui('profileBadge.joinDiscord')}</a></p>
    `;

    let overlay;
    let remainingSeconds = CUSTOM_PROFILE_BADGE_CONFIRMATION_COOLDOWN_SECONDS;
    const agreeButton = createButton(
        ui('profileBadge.agreeCountdown', { count: remainingSeconds }),
        'primary',
        {
            disabled: true,
            onClick: () => {
                overlay.close();
                window.open(
                    CUSTOM_PROFILE_BADGE_ITEM_URL,
                    '_blank',
                    'noopener',
                );
            },
        },
    );
    const cancelButton = createButton(ui('common.cancel'), 'secondary', {
        onClick: () => overlay.close(),
    });
    let cooldownTimer;

    overlay = createOverlay({
        title: ui('profileBadge.title'),
        bodyContent: body,
        actions: [cancelButton, agreeButton],
        maxWidth: '440px',
        showLogo: true,
        onClose: () => {
            if (cooldownTimer) window.clearInterval(cooldownTimer);
        },
    });

    cooldownTimer = window.setInterval(() => {
        remainingSeconds -= 1;
        if (remainingSeconds <= 0) {
            window.clearInterval(cooldownTimer);
            agreeButton.disabled = false;
            agreeButton.setAttribute('aria-disabled', 'false');
            agreeButton.textContent = ui('profileBadge.agree');
            return;
        }

        agreeButton.textContent = ui('profileBadge.agreeCountdown', {
            count: remainingSeconds,
        });
    }, 1000);
}

function renderCustomProfileBadgePurchaseButton(container = document) {
    const holder = container.querySelector(
        '#rovalra-custom-profile-badge-button-holder',
    );
    if (!holder || holder.dataset.rovalraCustomProfileBadgeRendered === 'true')
        return;

    const iconHolder = container.querySelector(
        '#rovalra-custom-profile-badge-icon-holder',
    );
    if (iconHolder) {
        const badgeIcon = Icon({
            icon: 'crown',
            filled: true,
            size: 'xx-large',
        });
        badgeIcon.setAttribute('aria-hidden', 'true');
        badgeIcon.style.cssText =
            'width: 52px; height: 52px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;';
        iconHolder.replaceChildren(badgeIcon);
    }

    holder.dataset.rovalraCustomProfileBadgeRendered = 'true';
    holder.replaceChildren(
        createSquareButton({
            content: ui('profileBadge.getRobux'),
            id: 'rovalra-custom-profile-badge-button',
            onClick: openCustomProfileBadgePurchaseOverlay,
            width: 'auto',
            height: 'height-1000',
            paddingX: 'padding-x-medium',
            radius: 'radius-medium',
            disableTextTruncation: true,
        }),
    );
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function getLevenshteinDistance(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = Array.from({ length: b.length + 1 }, (_, j) =>
        Array.from({ length: a.length + 1 }, (_, i) =>
            j === 0 ? i : i === 0 ? j : 0,
        ),
    );

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator,
            );
        }
    }
    return matrix[b.length][a.length];
}

export async function applyTheme() {
    if (document.body.classList.contains('rovalra-settings-loading')) {
        document.body.classList.remove('rovalra-settings-loading');
    }
}

const debouncedApplyTheme = debounce(applyTheme, 50);
const debouncedAddPopoverButton = debounce(addPopoverButton, 100);
const debouncedAddCustomButton = debounce(
    () => addCustomButton(debouncedAddPopoverButton),
    100,
);

function getBadgeStyle(key) {
    const badge = BADGE_CONFIG[key];
    if (!badge || !badge.style) return '';
    return Object.entries(badge.style)
        .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
        .join(';');
}

function getBadgeAssetAttribute(key) {
    const badge = BADGE_CONFIG[key];
    return badge?.iconAssetName
        ? `data-rovalra-asset="${badge.iconAssetName}"`
        : '';
}

function getDonatorTierRewardHtml(tier) {
    const key = `donator_${tier}`;
    const badge = BADGE_CONFIG[key];
    const rewardText = ts(`settings.donatorPerks.tier${tier}Reward`).replace(
        /\n/g,
        '<br>',
    );

    if (!badge) return rewardText;

    return `<span style="display: inline-flex; align-items: center; gap: 6px; vertical-align: middle;"><span>${rewardText}</span><img ${getBadgeAssetAttribute(key)} src="${badge.icon}" alt="" style="width: 18px; height: 18px; flex-shrink: 0; ${getBadgeStyle(key)}" /></span>`;
}

function getDonatorTierHeaderHtml(tier) {
    const key = `donator_${tier}`;
    return `<span class="rovalra-donator-tier-table-heading">
        <img ${getBadgeAssetAttribute(key)} src="${BADGE_CONFIG[key].icon}" alt="" style="${getBadgeStyle(key)}" />
        <span>${ts(`settings.donatorPerks.tier${tier}`)}</span>
    </span>`;
}

function createDonatorPerkLink(settingName, label) {
    return `<a href="#!/search?q=${encodeURIComponent(settingName)}" class="rovalra-perk-link" data-setting="${settingName}">${label}</a>`;
}

function getDonatorSettingsPerkRows() {
    const rows = [];
    for (const [categoryKey, category] of Object.entries(SETTINGS_CONFIG)) {
        const tabId = categoryKey.toLowerCase();
        if (tabId === 'info' || tabId === 'credits' || tabId === 'donatorperks')
            continue;

        for (const [settingName, setting] of Object.entries(
            category.settings,
        )) {
            if (setting.donatorTier) {
                rows.push({
                    label: createDonatorPerkLink(settingName, setting.label),
                    minTier: setting.donatorTier,
                });
            }
            if (setting.childSettings) {
                for (const [childName, childSetting] of Object.entries(
                    setting.childSettings,
                )) {
                    if (childSetting.donatorTier) {
                        rows.push({
                            label: createDonatorPerkLink(
                                childName,
                                childSetting.label,
                            ),
                            minTier: childSetting.donatorTier,
                        });
                    }
                }
            }
        }
    }
    return rows;
}

function getDonatorPerkStatusCell(hasPerk) {
    const label = hasPerk
        ? ui('donation.included')
        : ui('donation.notIncluded');
    return `<td class="rovalra-donator-perk-status-cell" aria-label="${label}" data-rovalra-donator-perk-included="${hasPerk ? 'true' : 'false'}"></td>`;
}

function renderDonatorPerkStatusPills(container) {
    container
        .querySelectorAll('[data-rovalra-donator-perk-included]')
        .forEach((cell) => {
            const isIncluded =
                cell.dataset.rovalraDonatorPerkIncluded === 'true';
            const label = isIncluded
                ? ui('donation.included')
                : ui('donation.notIncluded');
            const symbol = Icon({
                icon: isIncluded ? 'circle-check' : 'circle-minus',
                filled: true,
                size: 'medium',
                classes: isIncluded
                    ? 'rovalra-donator-perk-status-icon-included'
                    : 'rovalra-donator-perk-status-icon-not-included',
            });

            addTooltip(symbol, label, { position: 'top' });

            cell.replaceChildren(symbol);
        });
}

function getDonatorDiscordRolePerkHtml(tier) {
    return `<span class="rovalra-donator-discord-role-perk">${ts(`settings.donatorPerks.tier${tier}DiscordRole`).replace(/\n/g, '<br>')}</span>`;
}

function getDonatorPerksComparisonHtml(themeColors) {
    const baseRows = [
        {
            label: getDonatorTierRewardHtml(1),
            minTier: 1,
        },
        {
            label: getDonatorDiscordRolePerkHtml(1),
            minTier: 1,
        },
        {
            label: getDonatorTierRewardHtml(2),
            minTier: 2,
        },
        {
            label: getDonatorDiscordRolePerkHtml(2),
            minTier: 2,
        },
        {
            label: getDonatorTierRewardHtml(3),
            minTier: 3,
        },
        {
            label: getDonatorDiscordRolePerkHtml(3),
            minTier: 3,
        },
    ];
    const rows = [...baseRows, ...getDonatorSettingsPerkRows()];
    const body =
        rows.length > 0
            ? rows
                  .map(
                      ({ label, minTier }) => `
                        <tr>
                            <th scope="row">${label}</th>
                            ${[1, 2, 3]
                                .map((tier) =>
                                    getDonatorPerkStatusCell(tier >= minTier),
                                )
                                .join('')}
                        </tr>`,
                  )
                  .join('')
            : `<tr><th scope="row" colspan="4">${ts('settings.donatorPerks.moreComingSoon')}</th></tr>`;

    return `
        <div class="rovalra-donator-perks-compare" aria-label="${ts('settings.donatorPerks.perkTiers')}">
            <div class="rovalra-donator-tier-summary">
                ${[1, 2, 3]
                    .map(
                        (tier) => `
                            <div id="donator-tier-${tier}-header" class="rovalra-donator-tier-heading">
                                <img ${getBadgeAssetAttribute(`donator_${tier}`)} src="${BADGE_CONFIG[`donator_${tier}`].icon}" alt="" style="${getBadgeStyle(`donator_${tier}`)}" />
                                <div class="rovalra-donator-tier-copy">
                                    <h4>${ts(`settings.donatorPerks.tier${tier}`)}</h4>
                                    <span class="rovalra-donator-tier-price" data-tier="${tier}" style="display: block; margin-top: 4px; color: var(--rovalra-main-text-color); font-size: 12px; font-weight: 600;">${ts(
                                        `settings.donatorPerks.tier${tier}Desc`,
                                    )
                                        .replace(/<[^>]*>/g, '')
                                        .replace(/\s+/g, ' ')
                                        .trim()}</span>
                                </div>
                            </div>`,
                    )
                    .join('')}
            </div>
            <div class="rovalra-donator-perks-table-wrap">
                <table class="rovalra-donator-perks-table">
                    <thead>
                        <tr>
                            <th scope="col">${ts('settings.donatorPerks.perk')}</th>
                            <th scope="col">${getDonatorTierHeaderHtml(1)}</th>
                            <th scope="col">${getDonatorTierHeaderHtml(2)}</th>
                            <th scope="col">${getDonatorTierHeaderHtml(3)}</th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>`;
}

let contributorsCache = null;
let contributorsSortOrder = 'most';

function getContributorStats() {
    const counts = new Map(CREDITS_USER_IDS.map((id) => [String(id), 0]));
    let featureCount = 0;

    const countContributors = (setting, { isChild = false } = {}) => {
        if (!setting) return;

        const contributors = Array.isArray(setting.contributors)
            ? new Set(setting.contributors.map(String))
            : new Set();

        if (!isChild && contributors.size === 0)
            contributors.add(String(CREATOR_USER_ID));

        contributors.forEach((id) => {
            if (counts.has(id)) counts.set(id, counts.get(id) + 1);
        });
    };

    const countSetting = (setting, options) => {
        if (!setting) return;

        countContributors(setting, options);

        Object.values(setting.childSettings || {}).forEach((childSetting) =>
            countSetting(childSetting, { isChild: true }),
        );
    };

    Object.values(SETTINGS_CONFIG).forEach((category) => {
        Object.values(category.settings || {}).forEach((setting) => {
            featureCount += 1;
            countSetting(setting);
        });
    });

    Object.values(OTHER_CONTRIBUTIONS).forEach((category) => {
        const contributors = category.contributors;
        for (const contributor of contributors) {
            const id = contributor.userId;
            if (counts.has(id)) counts.set(id, counts.get(id) + 1);
            featureCount += 1;
        }
    });

    return { counts, featureCount };
}

/**
 * @returns {Record<string, Array<{key: string, feature: string, contributionDescription?: string, prLink?: string}>>}
 */
function getContributions() {
    /**
     * @type {Record<string, Array<{key: string, feature: string, contributionDescription?: string, prLink?: string}>>}
     */
    const contributions = {};
    for (const contributor of CONTRIBUTOR_USER_IDS) {
        contributions[String(contributor)] = [];
    }
    for (const category of Object.values(SETTINGS_CONFIG)) {
        for (const [settingName, settingData] of Object.entries(
            category.settings,
        )) {
            if (settingData.contributors !== undefined) {
                for (const contributor of settingData.contributors) {
                    if (contributions[String(contributor)] === undefined)
                        contributions[String(contributor)] = [];
                    contributions[String(contributor)].push({
                        feature: settingData.label,
                        key: settingName,
                    });
                }
            } else {
                if (contributions[String(CREATOR_USER_ID)] === undefined)
                    contributions[String(CREATOR_USER_ID)] = [];
                contributions[String(CREATOR_USER_ID)].push({
                    feature: settingData.label,
                    key: settingName,
                });
            }
            if (settingData.childSettings) {
                for (const [subSettingName, subSettingData] of Object.entries(
                    settingData.childSettings,
                )) {
                    if (subSettingData.contributors !== undefined) {
                        for (const contributor of subSettingData.contributors) {
                            if (
                                contributions[String(contributor)] === undefined
                            )
                                contributions[String(contributor)] = [];
                            contributions[String(contributor)].push({
                                feature: subSettingData.label,
                                key: subSettingName,
                            });
                        }
                    }
                }
            }
        }
    }
    for (const [contKey, contData] of Object.entries(OTHER_CONTRIBUTIONS)) {
        for (const contribution of contData.contributors) {
            const contributorKey = String(contribution.userId);
            if (contributions[contributorKey] === undefined) {
                contributions[contributorKey] = [];
            }
            contributions[contributorKey].push({
                feature: contData.label,
                key: contKey,
                contributionDescription: contribution.contributionDescription,
                prLink: contribution.relevantPR,
            });
        }
    }

    return contributions;
}

const {
    counts: contributorContributionCounts,
    featureCount: totalFeatureCount,
} = getContributorStats();

function addContributorTooltip(link, id) {
    const tooltipKey = `settings.credits.contributorTooltips.${id}`;
    const tooltipText = ts(tooltipKey);
    if (!tooltipText || tooltipText === tooltipKey) return;

    addTooltip(link, tooltipText, {
        position: 'top',
    });
}

function createContributorProfile(user, thumbData) {
    const profile = document.createElement('div');
    profile.className = 'rovalra-contributor-profile';

    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-card-image';
    Object.assign(avatarContainer.style, {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        marginRight: '10px',
        overflow: 'hidden',
        flexShrink: '0',
    });

    const thumbElement = createThumbnailElement(
        thumbData,
        user.displayName,
        '',
        {
            width: '100%',
            height: '100%',
            borderRadius: '50%',
        },
    );

    const name = document.createElement('span');
    name.className = 'rovalra-contributor-name';
    name.textContent = user.displayName;

    avatarContainer.appendChild(thumbElement);
    profile.append(avatarContainer, name);

    return profile;
}

function renderContributors(container, users, thumbMap) {
    container.replaceChildren();

    const translatorIds = new Set(TRANSLATOR_USER_IDS.map(String));
    const contributors = CREDITS_USER_IDS.map((id, index) => {
        const stringId = String(id);
        return {
            id: stringId,
            index,
            user: users.find((u) => String(u.id) === stringId),
            contributionCount: contributorContributionCounts.get(stringId) || 0,
        };
    }).filter(({ user }) => user);

    const featureContributors = contributors
        .filter(({ contributionCount }) => contributionCount > 0)
        .sort((a, b) => {
            const countSort =
                contributorsSortOrder === 'least'
                    ? a.contributionCount - b.contributionCount
                    : b.contributionCount - a.contributionCount;
            return countSort || a.index - b.index;
        });
    const backendContributors = contributors.filter(
        ({ contributionCount }) => contributionCount === 0,
    );
    const translators = contributors.filter(({ id }) => translatorIds.has(id));

    const sortBar = document.createElement('div');
    sortBar.className = 'rovalra-contributors-toolbar';

    const sortLabel = document.createElement('span');
    sortLabel.className = 'rovalra-contributors-sort-label';
    sortLabel.textContent = ts('settings.credits.sortLabel');

    const sortToggle = createPillToggle({
        options: [
            {
                text: ts('settings.credits.sortMost'),
                value: 'most',
            },
            {
                text: ts('settings.credits.sortLeast'),
                value: 'least',
            },
        ],
        initialValue: contributorsSortOrder,
        onChange: (value) => {
            contributorsSortOrder = value;
            renderContributors(container, users, thumbMap);
        },
    });

    sortBar.append(sortLabel, sortToggle);

    const listContainer = document.createElement('ol');
    listContainer.className = 'rovalra-contributors-list';

    featureContributors.forEach(({ id, user, contributionCount }) => {
        const item = document.createElement('li');
        item.className = 'rovalra-contributors-item';

        const link = document.createElement('a');
        link.className =
            'avatar-card-link rovalra-donator-card rovalra-contributor-row';
        link.href = `https://www.roblox.com/users/${id}/profile`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        addContributorTooltip(link, id);

        const count = document.createElement('span');
        count.className = 'rovalra-contributor-count';
        count.textContent = ts('settings.credits.contributionCount', {
            count: contributionCount,
        });

        count.addEventListener('click', async (ev) => {
            const contributions = getContributions()[String(id)];

            let markdown = `
| ${await t('settings.credits.ui.popup.featureName')} | ${await t('settings.credits.ui.popup.featureKey')} |
|                   -                            |                       -                       |
`;

            for (const contribution of contributions) {
                markdown += `| `;
                const featureNameText = contribution.contributionDescription
                    ? `${contribution.feature} (${await t(contribution.contributionDescription)})`
                    : contribution.feature;
                markdown += `${contribution.prLink ? `[${featureNameText}](${contribution.prLink})` : featureNameText} | `;
                markdown += `${contribution.prLink ? `[${contribution.key}](${contribution.prLink})` : contribution.key} |\n`;
            }

            const html = parseMarkdown(markdown);

            const bodyContent = document.createElement('div');
            bodyContent.innerHTML = html;

            const okayBtn = createButton(ui('common.okay'), 'primary', {
                onClick: async () => {
                    overlay.close();
                },
            });

            const overlay = createOverlay({
                title: await t('settings.credits.ui.popup.title', {
                    user: user.displayName,
                }),
                bodyContent: bodyContent,
                actions: [okayBtn],
                showLogo: true,
                maxWidth: '50%',
            });
        });

        link.appendChild(
            createContributorProfile(user, thumbMap.get(String(id))),
        );
        item.appendChild(link);
        item.appendChild(count);
        listContainer.appendChild(item);
    });

    container.append(sortBar, listContainer);

    if (backendContributors.length > 0) {
        const backendNote = document.createElement('p');
        backendNote.className = 'rovalra-backend-contributors-note';
        backendNote.textContent = ts('settings.credits.backendContributorsNote');

        const backendList = document.createElement('div');
        backendList.className = 'rovalra-backend-contributors-list';

        backendContributors.forEach(({ id, user }) => {
            const link = document.createElement('a');
            link.className =
                'avatar-card-link rovalra-donator-card rovalra-backend-contributor-card';
            link.href = `https://www.roblox.com/users/${id}/profile`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            addContributorTooltip(link, id);

            link.appendChild(createContributorProfile(user, thumbMap.get(id)));
            backendList.appendChild(link);
        });

        container.append(backendNote, backendList);
    }

    if (translators.length === 0) return;

    const translatorsTitle = document.createElement('h3');
    translatorsTitle.textContent = ts('settings.credits.translatorsTitle');
    translatorsTitle.style.cssText =
        'margin: 24px 0 10px; color: var(--rovalra-main-text-color);';

    const translatorsList = document.createElement('div');
    translatorsList.className = 'rovalra-backend-contributors-list';

    translators.forEach(({ id, user }) => {
        const link = document.createElement('a');
        link.className =
            'avatar-card-link rovalra-donator-card rovalra-backend-contributor-card';
        link.href = `https://www.roblox.com/users/${id}/profile`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        addContributorTooltip(link, id);
        link.appendChild(createContributorProfile(user, thumbMap.get(id)));
        translatorsList.appendChild(link);
    });

    container.append(translatorsTitle, translatorsList);
}

function renderContributorsShimmer(container) {
    container.replaceChildren();
    const listContainer = document.createElement('ol');
    listContainer.className = 'rovalra-contributors-list';

    CREDITS_USER_IDS.forEach(() => {
        const item = document.createElement('li');
        item.className = 'rovalra-donator-card rovalra-contributor-loading-row';

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-card-image';
        Object.assign(avatarContainer.style, {
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            marginRight: '10px',
            overflow: 'hidden',
            flexShrink: '0',
        });

        const thumbShimmer = createThumbnailElement(
            { state: 'Pending' },
            ui('common.loading'),
            '',
            {
                width: '100%',
                height: '100%',
            },
        );

        const nameShimmer = document.createElement('div');
        nameShimmer.className = 'thumbnail-2d-container shimmer';
        nameShimmer.style.cssText =
            'width: 80px; height: 14px; border-radius: 4px;';

        avatarContainer.appendChild(thumbShimmer);
        item.append(avatarContainer, nameShimmer);
        listContainer.appendChild(item);
    });

    container.appendChild(listContainer);
}

async function loadContributors() {
    const container = document.getElementById('rovalra-contributors-list');
    if (!container) return;

    if (contributorsCache) {
        renderContributors(
            container,
            contributorsCache.users,
            contributorsCache.thumbMap,
        );
        return;
    }

    renderContributorsShimmer(container);

    try {
        const response = await callRobloxApi({
            subdomain: 'users',
            endpoint: '/v1/users',
            method: 'POST',
            body: {
                userIds: CREDITS_USER_IDS,
                excludeBannedUsers: false,
            },
        });

        if (!response.ok) throw new Error('Failed to fetch users');
        const data = await response.json();
        const users = data.data;

        const thumbnails = await getBatchThumbnails(
            CREDITS_USER_IDS,
            'AvatarHeadshot',
            '150x150',
        );
        const thumbMap = new Map();
        thumbnails.forEach((t) => {
            thumbMap.set(String(t.targetId), t);
        });

        contributorsCache = { users, thumbMap };
        renderContributors(container, users, thumbMap);
    } catch (err) {
        console.error('RoValra: Error loading contributors', err);
        const error = document.createElement('p');
        error.className = 'rovalra-contributors-error';
        error.textContent = ts('settings.credits.failedToLoadContributors');
        container.replaceChildren(error);
    }
}

function createAnonymousToggle(isAnonymous, onToggle) {
    const anonBtn = document.createElement('button');
    anonBtn.style.cssText =
        'background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; margin-left: 5px; color: var(--rovalra-secondary-text-color); flex-shrink: 0; transition: color 0.2s;';

    const path1 =
        'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7M2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2m4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3z';
    const path2 =
        'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3';

    anonBtn.innerHTML = `<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="${isAnonymous ? path1 : path2}"></path></svg>`;

    addTooltip(
        anonBtn,
        isAnonymous ? 'Disable anonymous mode' : 'Enable anonymous mode',
    );

    anonBtn.onclick = onToggle;
    return anonBtn;
}

function getTotalDonatedFromBadgesResponse(response) {
    const totalDonated =
        response?.badges?.total_donated ??
        response?.total_donated ??
        response?.badges?.totalDonated ??
        response?.totalDonated;

    const numericTotal = Number(totalDonated);
    return !isNaN(numericTotal) &&
        totalDonated !== null &&
        totalDonated !== undefined
        ? numericTotal
        : null;
}

function createVerifiedBadgeIcon(size = '14px') {
    const badge = document.createElement('img');
    badge.src = assets.verifiedBadge;
    badge.alt = 'Verified Badge';
    badge.title = 'Verified Badge';
    badge.width = parseInt(size, 10);
    badge.height = parseInt(size, 10);
    badge.className = 'rovalra-donator-verified-badge';
    return badge;
}

function getGithubSponsorImageSource(sponsor) {
    const image =
        sponsor?.avatar_url ??
        sponsor?.avatarUrl ??
        sponsor?.image_url ??
        sponsor?.image ??
        (sponsor?.content
            ? {
                  content: sponsor.content,
                  mimeType:
                      sponsor.contentType ?? sponsor.mimeType ?? sponsor.type,
              }
            : null);

    if (typeof image === 'string') {
        const source = image.trim();
        if (
            source.startsWith('https://') ||
            source.startsWith('http://') ||
            source.startsWith('data:image/')
        ) {
            return source;
        }
        return null;
    }

    if (image && typeof image === 'object') {
        const content = image.content ?? image.data ?? image.base64;
        if (typeof content !== 'string' || !content.trim()) return null;

        const value = content.trim();
        if (value.startsWith('data:image/')) return value;
        if (value.startsWith('https://') || value.startsWith('http://')) {
            return value;
        }

        const mimeType =
            image.mimeType ?? image.contentType ?? image.type ?? 'image/png';
        if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
            return null;
        }
        return `data:${mimeType};base64,${value}`;
    }

    return null;
}

function getGithubSponsorAvatarEndpoint(sponsor, imageSource) {
    const login = sponsor?.login ?? sponsor?.username;
    if (login) {
        return `/v1/github/sponsors/${encodeURIComponent(login)}/avatar`;
    }

    if (typeof imageSource === 'string') {
        try {
            const url = new URL(imageSource);
            if (
                url.hostname === 'apis.rovalra.com' &&
                url.pathname.includes('/v1/github/sponsors/')
            ) {
                return `${url.pathname}${url.search}`;
            }
        } catch {}
    }

    return null;
}

async function loadGithubSponsorAvatar(avatar, sponsor, imageSource) {
    const setAvatarSource = (source) => {
        avatar.addEventListener(
            'load',
            () => avatar.classList.remove('shimmer'),
            { once: true },
        );
        avatar.src = source;
    };

    if (imageSource?.startsWith('data:image/')) {
        setAvatarSource(imageSource);
        return;
    }

    const endpoint = getGithubSponsorAvatarEndpoint(sponsor, imageSource);
    if (!endpoint) {
        if (imageSource) setAvatarSource(imageSource);
        return;
    }

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint,
            method: 'GET',
            noCache: true,
        });

        if (!response.ok)
            throw new Error(`Avatar request failed (${response.status})`);

        const contentType = response.headers.get('content-type') || '';
        if (contentType && !contentType.toLowerCase().startsWith('image/')) {
            throw new Error(
                `Avatar response was not an image (${contentType})`,
            );
        }

        const blob = await response.blob();
        if (!blob.type.toLowerCase().startsWith('image/')) {
            throw new Error(
                `Avatar blob was not an image (${blob.type || 'unknown'})`,
            );
        }

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () =>
                reject(
                    reader.error || new Error('Could not read avatar image'),
                );
            reader.readAsDataURL(blob);
        });

        setAvatarSource(dataUrl);
    } catch (error) {
        console.warn('RoValra: Failed to load GitHub sponsor avatar', error);
    }
}

function renderGithubSponsors(container, sponsors) {
    container.replaceChildren();

    if (!sponsors.length) {
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'rovalra-github-sponsors-grid';

    sponsors.forEach((sponsor) => {
        const imageSource = getGithubSponsorImageSource(sponsor);
        const profileUrl = sponsor?.profile_url ?? sponsor?.profileUrl;
        const avatarEndpoint = getGithubSponsorAvatarEndpoint(
            sponsor,
            imageSource,
        );
        if ((!imageSource && !avatarEndpoint) || !profileUrl) return;

        const link = document.createElement('a');
        link.className = 'rovalra-github-sponsor-link';
        link.href = profileUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const sponsorName = sponsor.name || sponsor.login || 'GitHub sponsor';
        link.setAttribute('aria-label', sponsorName);
        addTooltip(link, sponsorName);

        const avatar = document.createElement('img');
        avatar.className = 'rovalra-github-sponsor-avatar';
        avatar.classList.add('shimmer');
        avatar.src = GITHUB_SPONSOR_TRANSPARENT_PIXEL;
        avatar.alt = sponsorName;
        avatar.title = sponsorName;
        avatar.loading = 'lazy';
        avatar.referrerPolicy = 'no-referrer';

        link.appendChild(avatar);
        grid.appendChild(link);
        loadGithubSponsorAvatar(avatar, sponsor, imageSource);
    });

    if (grid.childElementCount > 0) container.appendChild(grid);
}

function renderGithubSponsorsShimmer(container) {
    container.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'rovalra-github-sponsors-grid';

    for (let i = 0; i < 3; i++) {
        const avatar = createShimmerBlock({
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            className: 'rovalra-github-sponsor-avatar',
        });
        grid.appendChild(avatar);
    }

    container.appendChild(grid);
}

async function loadGithubSponsors() {
    const container = document.getElementById('rovalra-github-sponsors');
    if (!container) return;

    if (githubSponsorsCache) {
        renderGithubSponsors(container, githubSponsorsCache);
        return;
    }

    renderGithubSponsorsShimmer(container);

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/github/sponsors',
            method: 'GET',
        });

        if (!response.ok) throw new Error('Failed to fetch GitHub sponsors');
        const data = await response.json();
        const sponsors = Array.isArray(data.sponsors) ? data.sponsors : [];
        githubSponsorsCache = sponsors;
        renderGithubSponsors(container, sponsors);
    } catch (err) {
        console.error('RoValra: Error loading GitHub sponsors', err);
        container.replaceChildren();
    }
}

function renderTopDonators(container, donators, thumbMap, currentUserId) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top: 15px;';

    const top3 = donators.slice(0, 3);
    if (top3.length > 0) {
        const pedestalContainer = document.createElement('div');
        pedestalContainer.style.cssText =
            'display: flex; align-items: flex-end; justify-content: center; gap: 20px; margin-bottom: 30px; padding: 20px 0; border-bottom: 1px solid var(--rovalra-border-color);';

        const podiumData = [
            donators[2]
                ? {
                      ...donators[2],
                      rank: 3,
                      color: '#cd7f32',
                      height: '60px',
                      size: '64px',
                  }
                : null,
            donators[0]
                ? {
                      ...donators[0],
                      rank: 1,
                      color: '#ffd700',
                      height: '100px',
                      size: '80px',
                  }
                : null,
            donators[1]
                ? {
                      ...donators[1],
                      rank: 2,
                      color: '#c0c0c0',
                      height: '80px',
                      size: '72px',
                  }
                : null,
        ].filter(Boolean);

        podiumData.forEach((data) => {
            const column = document.createElement('div');
            column.className = 'rovalra-donator-card';
            column.style.cssText =
                'display: flex; flex-direction: column; align-items: center; width: 110px;';

            const thumbData = thumbMap.get(String(data.user_id));
            const thumbElement = createThumbnailElement(
                thumbData,
                data.username,
                '',
                {
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                },
            );

            const isAnonymous = String(data.user_id) === '1';

            const thumbLink = document.createElement(isAnonymous ? 'div' : 'a');
            if (!isAnonymous) {
                thumbLink.href = `https://www.roblox.com/users/${data.user_id}/profile`;
                thumbLink.className = 'avatar-card-link';
                thumbLink.target = '_blank';
            }
            thumbLink.style.display = 'block';
            if (isAnonymous) thumbLink.style.cursor = 'default';

            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-card-image-container';
            Object.assign(avatarContainer.style, {
                width: data.size,
                height: data.size,
                marginBottom: '10px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            });

            const avatarImage = document.createElement('div');
            avatarImage.className = 'avatar-card-image';
            Object.assign(avatarImage.style, {
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: `3px solid ${data.color}`,
                backgroundColor: 'var(--rovalra-container-background-color)',
                overflow: 'hidden',
            });
            avatarImage.appendChild(thumbElement);
            avatarContainer.appendChild(avatarImage);
            thumbLink.appendChild(avatarContainer);

            const name = document.createElement(isAnonymous ? 'span' : 'a');
            if (!isAnonymous) {
                name.href = `https://www.roblox.com/users/${data.user_id}/profile`;
                name.target = '_blank';
            }
            name.textContent = data.username;
            name.style.cssText =
                'color: var(--rovalra-main-text-color); font-weight: bold; font-size: 13px; text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            if (data.isVerified && !isAnonymous) {
                name.appendChild(createVerifiedBadgeIcon());
            }
            if (isAnonymous) {
                name.style.cursor = 'default';
                addTooltip(thumbLink, 'This user has enabled anonymous mode');
                addTooltip(name, 'This user has enabled anonymous mode');
            }

            const amount = document.createElement('div');
            amount.innerHTML = `<span class="icon-robux-16x16"></span>${data.amount.toLocaleString()}`;
            amount.style.cssText =
                'color: var(--rovalra-main-text-color); font-size: 13px; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; gap: 2px;';

            const stool = document.createElement('div');
            stool.style.cssText = `width: 80px; height: ${data.height}; background-color: var(--rovalra-container-background-color); border-radius: 8px 8px 0 0; border: 1px solid var(--rovalra-border-color); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: ${data.color};`;
            stool.textContent = data.rank;

            column.append(thumbLink, name, amount, stool);
            pedestalContainer.appendChild(column);
        });
        wrapper.appendChild(pedestalContainer);
    }

    const remaining = donators.slice(3);
    if (remaining.length > 0) {
        const list = document.createElement('div');
        list.style.cssText =
            'display: flex; flex-direction: column; gap: 10px;';

        remaining.forEach((donor, idx) => {
            const rank = idx + 4;
            const item = document.createElement('div');
            item.className = 'rovalra-donator-card';
            item.style.cssText =
                'display: flex; align-items: center; padding: 10px 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color);';

            const rankEl = document.createElement('span');
            rankEl.textContent = `#${rank}`;
            rankEl.style.cssText =
                'width: 40px; font-weight: bold; color: var(--rovalra-secondary-text-color); font-size: 14px;';

            const thumbData = thumbMap.get(String(donor.user_id));
            const thumb = createThumbnailElement(
                thumbData,
                donor.username,
                '',
                {
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                },
            );

            const isAnonymous = String(donor.user_id) === '1';

            const thumbLink = document.createElement(isAnonymous ? 'div' : 'a');
            if (!isAnonymous) {
                thumbLink.href = `https://www.roblox.com/users/${donor.user_id}/profile`;
                thumbLink.className = 'avatar-card-link';
                thumbLink.target = '_blank';
            }
            thumbLink.style.display = 'flex';
            if (isAnonymous) thumbLink.style.cursor = 'default';

            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-card-image-container';
            Object.assign(avatarContainer.style, {
                width: '36px',
                height: '36px',
                marginRight: '15px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            });

            const avatarImage = document.createElement('div');
            avatarImage.className = 'avatar-card-image';
            Object.assign(avatarImage.style, {
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: 'var(--rovalra-container-background-color)',
                overflow: 'hidden',
            });
            avatarImage.appendChild(thumb);
            avatarContainer.appendChild(avatarImage);
            thumbLink.appendChild(avatarContainer);

            const userInfo = document.createElement('div');
            userInfo.style.cssText =
                'flex: 1; display: flex; align-items: center; justify-content: space-between;';

            const name = document.createElement(isAnonymous ? 'span' : 'a');
            if (!isAnonymous) {
                name.href = `https://www.roblox.com/users/${donor.user_id}/profile`;
                name.target = '_blank';
            }
            name.textContent = donor.username;
            name.style.cssText =
                'color: var(--rovalra-main-text-color); font-weight: 500; text-decoration: none; font-size: 14px;';
            if (donor.isVerified && !isAnonymous) {
                name.appendChild(createVerifiedBadgeIcon());
            }
            if (isAnonymous) {
                name.style.cursor = 'default';
                addTooltip(thumbLink, 'This user has enabled anonymous mode');
                addTooltip(name, 'This user has enabled anonymous mode');
            }
            const amount = document.createElement('span');
            amount.innerHTML = `<span class="icon-robux-16x16" style="margin-right: 2px;"></span>${donor.amount.toLocaleString()}`;
            amount.style.cssText =
                'color: var(--rovalra-secondary-text-color); font-size: 12px; font-weight: bold; display: flex; align-items: center;';

            userInfo.append(name, amount);
            item.append(rankEl, thumbLink, userInfo);
            list.appendChild(item);
        });
        wrapper.appendChild(list);
    }

    container.appendChild(wrapper);
}

function renderTopDonatorsShimmer(container) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top: 15px;';

    const pedestalContainer = document.createElement('div');
    pedestalContainer.style.cssText =
        'display: flex; align-items: flex-end; justify-content: center; gap: 20px; margin-bottom: 30px; padding: 20px 0; border-bottom: 1px solid var(--rovalra-border-color);';

    const podiumOrder = [
        { rank: 3, height: '60px', size: '64px', color: '#cd7f32' },
        { rank: 1, height: '100px', size: '80px', color: '#ffd700' },
        { rank: 2, height: '80px', size: '72px', color: '#c0c0c0' },
    ];

    podiumOrder.forEach((config) => {
        const column = document.createElement('div');
        column.className = 'rovalra-donator-card';
        column.style.cssText =
            'display: flex; flex-direction: column; align-items: center; width: 110px;';

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-card-image-container';
        Object.assign(avatarContainer.style, {
            width: config.size,
            height: config.size,
            marginBottom: '10px',
            position: 'relative',
        });

        const avatarImage = document.createElement('div');
        avatarImage.className = 'avatar-card-image';
        Object.assign(avatarImage.style, {
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            border: `3px solid ${config.color}`,
            backgroundColor: 'var(--rovalra-container-background-color)',
            overflow: 'hidden',
        });

        const thumbShimmer = createThumbnailElement(
            { state: 'Pending' },
            ui('common.loading'),
            '',
            {
                width: '100%',
                height: '100%',
            },
        );

        avatarImage.appendChild(thumbShimmer);
        avatarContainer.appendChild(avatarImage);
        const nameShimmer = document.createElement('div');
        nameShimmer.className = 'thumbnail-2d-container shimmer';
        nameShimmer.style.cssText =
            'width: 80px; height: 14px; border-radius: 4px; margin-bottom: 10px;';

        const amountShimmer = document.createElement('div');
        amountShimmer.className = 'thumbnail-2d-container shimmer';
        amountShimmer.style.cssText =
            'width: 50px; height: 12px; border-radius: 4px; margin-bottom: 10px;';

        const stool = document.createElement('div');
        stool.style.cssText = `width: 80px; height: ${config.height}; background-color: var(--rovalra-container-background-color); border-radius: 8px 8px 0 0; border: 1px solid var(--rovalra-border-color); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: ${config.color}; opacity: 0.5;`;
        stool.textContent = config.rank;

        column.append(avatarContainer, nameShimmer, amountShimmer, stool);
        pedestalContainer.appendChild(column);
    });
    wrapper.appendChild(pedestalContainer);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    for (let i = 0; i < 5; i++) {
        const item = document.createElement('div');
        item.className = 'rovalra-donator-card';
        item.style.cssText =
            'display: flex; align-items: center; padding: 10px 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color);';

        const rankEl = document.createElement('span');
        rankEl.textContent = `#${i + 4}`;
        rankEl.style.cssText =
            'width: 40px; font-weight: bold; color: var(--rovalra-secondary-text-color); font-size: 14px; opacity: 0.5;';

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-card-image-container';
        Object.assign(avatarContainer.style, {
            width: '36px',
            height: '36px',
            marginRight: '15px',
            position: 'relative',
        });

        const avatarImage = document.createElement('div');
        avatarImage.className = 'avatar-card-image';
        Object.assign(avatarImage.style, {
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            overflow: 'hidden',
        });

        const thumbShimmer = createThumbnailElement(
            { state: 'Pending' },
            ui('common.loading'),
            '',
            {
                width: '100%',
                height: '100%',
            },
        );

        avatarImage.appendChild(thumbShimmer);
        avatarContainer.appendChild(avatarImage);

        const userInfo = document.createElement('div');
        userInfo.style.cssText =
            'flex: 1; display: flex; align-items: center; justify-content: space-between;';

        const nameShimmer = document.createElement('div');
        nameShimmer.className = 'thumbnail-2d-container shimmer';
        nameShimmer.style.cssText =
            'width: 100px; height: 14px; border-radius: 4px;';

        const amountShimmer = document.createElement('div');
        amountShimmer.className = 'thumbnail-2d-container shimmer';
        amountShimmer.style.cssText =
            'width: 60px; height: 12px; border-radius: 4px;';

        userInfo.append(nameShimmer, amountShimmer);
        item.append(rankEl, avatarContainer, userInfo);
        list.appendChild(item);
    }
    wrapper.appendChild(list);

    container.appendChild(wrapper);
}

async function loadTopDonators() {
    const container = document.getElementById('rovalra-top-donators');
    const toggleContainer = document.getElementById(
        'rovalra-anon-toggle-container',
    );
    if (!container) return;

    if (topDonatorsCache) {
        if (toggleContainer && topDonatorsCache.authedDonorInfo) {
            renderAnonToggleArea(
                toggleContainer,
                topDonatorsCache.authedDonorInfo,
            );
        }
        renderTopDonators(
            container,
            topDonatorsCache.donators,
            topDonatorsCache.thumbMap,
            topDonatorsCache.currentUserId,
        );
        return;
    }
    renderTopDonatorsShimmer(container);

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/donators/top',
            method: 'GET',
        });

        if (!response.ok) throw new Error('Failed to fetch top donators');
        const data = await response.json();
        const donators = data.donators || [];

        if (donators.length === 0) {
            container.innerHTML = '';
            return;
        }

        const userIds = donators.map((d) => d.user_id);
        const profileUserIds = userIds.filter((id) => String(id) !== '1');
        const [thumbnails, profileData] = await Promise.all([
            getBatchThumbnails(userIds, 'AvatarHeadshot', '150x150'),
            profileUserIds.length > 0
                ? getUserProfileData(profileUserIds)
                : Promise.resolve(null),
        ]);
        const thumbMap = new Map();
        thumbnails.forEach((t) => {
            thumbMap.set(String(t.targetId), t);
        });
        const profileMap = new Map(
            (profileData?.profileDetails || []).map((profile) => [
                String(profile.userId),
                profile,
            ]),
        );
        const enrichedDonators = donators.map((donator) => ({
            ...donator,
            username:
                profileMap.get(String(donator.user_id))?.names?.combinedName ||
                donator.username,
            isVerified:
                String(donator.user_id) !== '1' &&
                profileMap.get(String(donator.user_id))?.isVerified === true,
        }));

        const authenticatedUserId = await getAuthenticatedUserId();
        const userTier = getCurrentUserTierSync();
        let authedDonorInfo = null;

        if (authenticatedUserId && userTier >= 1 && toggleContainer) {
            try {
                const settings = await getUserSettings(authenticatedUserId, {
                    noCache: true,
                });

                const userResponse = await callRobloxApi({
                    subdomain: 'users',
                    endpoint: `/v1/users/${authenticatedUserId}`,
                    method: 'GET',
                });

                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    const thumbs = await getBatchThumbnails(
                        [authenticatedUserId],
                        'AvatarHeadshot',
                        '60x60',
                    );
                    authedDonorInfo = {
                        userId: authenticatedUserId,
                        name: userData.displayName || userData.name,
                        thumb: thumbs[0],
                        isAnonymous: settings.anonymous_leaderboard === true,
                    };
                    renderAnonToggleArea(toggleContainer, authedDonorInfo);
                }
            } catch (error) {
                console.error(
                    'RoValra: Error rendering anon toggle area',
                    error,
                );
            }
        }

        topDonatorsCache = {
            donators: enrichedDonators,
            thumbMap,
            currentUserId: authenticatedUserId,
            authedDonorInfo,
        };
        renderTopDonators(
            container,
            enrichedDonators,
            thumbMap,
            authenticatedUserId,
        );
    } catch (err) {
        console.error('RoValra: Error loading top donators', err);
        container.innerHTML = '';
    }
}

function renderAnonToggleArea(container, info) {
    container.innerHTML = '';
    container.style.cssText =
        'display: flex; align-items: center; gap: 8px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--rovalra-border-color);';

    const thumb = createThumbnailElement(info.thumb, info.name, '', {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
    });

    const nameSpan = document.createElement('span');
    nameSpan.textContent = info.name;
    nameSpan.style.cssText =
        'color: var(--rovalra-main-text-color); font-size: 12px; font-weight: 600;';

    const toggle = createAnonymousToggle(info.isAnonymous, async (e) => {
        e.preventDefault();
        const success = await updateUserSettingViaApi(
            'anonymous_leaderboard',
            !info.isAnonymous,
        );
        if (success) {
            topDonatorsCache = null; // Force refetch to update leaderboard
            loadTopDonators();
        }
    });

    container.append(thumb, nameSpan, toggle);
}

export const buttonData = [
    {
        id: 'info',
        get text() {
            return ts('settings.tabs.info');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">${ts('settings.info.title')}</h2>
                <p>${ts('settings.info.desc1')}</p>
                <div style="margin-top: 5px;">
                    <p>${ts('settings.info.desc2')}</p>
                    <div style="margin-top: 5px;">
                        <p>${ts('settings.info.desc3')}</p>
                        <div style="margin-top: 5px;">
                            <p>${ts('settings.info.desc4')}</p>
                                <div style="margin-top: 5px;">
                                    <p>${ts('settings.info.suggestions')}</p>
                                    <div style="margin-top: 5px;">
                                        <p>${ts('settings.info.bugs')}</p>
                                        <div style="margin-top: 5px;">
                                            <p>${ts('settings.info.review')}</p>
                                        </div>
                                        <div style="margin-top: 10px; margin-bottom: 20px;">
                                            <a href="https://discord.gg/GHd5cSKJRk" target="_blank" class="rovalra-discord-link">
                                                <icon>discord</icon> ${ts('settings.info.discord')}
                                            </a>
                                            <br />
                                            <a href="https://github.com/NotValra/RoValra" target="_blank" class="rovalra-github-link">
                                                <icon filled>github</icon> ${ts('settings.info.github')}
                                            </a>
                                            <br />
                                            <a href="https://www.roblox.com/my/account?rovalra=donator+perks" class="rovalra-donator-link">
                                                <icon filled>heart</icon> ${ts('settings.info.support')}
                                            </a>
                                            <br />
                                            <a href="https://www.tiktok.com/@valrawantbanana" target="_blank" class="rovalra-tiktok-link">
                                                <icon size="large">tik-tok</icon> ${ts('settings.info.tiktok')}
                                            </a>
                                            <br />
                                            <a href="https://x.com/ValraSwag" target="_blank" class="rovalra-x-link">
                                                <icon>twitter</icon> ${ts('settings.info.x')}
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        },
    },
    {
        id: 'credits',
        get text() {
            return ts('settings.tabs.credits');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">${ts('settings.credits.contributorsTitle')} <span style="font-size: 12px; color: var(--rovalra-secondary-text-color);">(${ts('settings.credits.featureCount', { count: totalFeatureCount })})</span></h2>
                <div id="rovalra-contributors-list"></div>
            </div>`;
        },
    },
    {
        id: 'donatorPerks',
        get text() {
            return ts('settings.tabs.donatorPerks');
        },
        get content() {
            const theme = getCurrentTheme();
            const themeColors = THEME_CONFIG[theme] || THEME_CONFIG.dark;

            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">${ts('settings.donatorPerks.title')}</h2>
                <p>${ts('settings.donatorPerks.subtitle')}</p>

                <div style="margin-top: 15px; font-size: 13px; color: var(--rovalra-secondary-text-color);">
                    ${parseMarkdown(ts('settings.donatorPerks.note'), themeColors)}
                </div>

                <div style="margin-top: 15px; padding: 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2)); display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap;">
                    <div style="min-width: 220px; flex: 1; display: flex; align-items: center; gap: 14px;">
                        <img data-rovalra-asset="rovalraIcon" src="${assets.rovalraIcon}" alt="" style="width: 52px; height: 52px; flex-shrink: 0;" />
                        <div>
                            <h3 style="color: var(--rovalra-main-text-color); margin: 0 0 5px 0; font-size: 18px;">${ui('donation.supportTitle')}</h3>
                            <p style="color: var(--rovalra-secondary-text-color); margin: 0; font-size: 14px;">${ui('donation.supportDescription')}</p>
                        </div>
                    </div>
                    <div style="flex-shrink: 0;">
                        <div id="rovalra-donator-perks-donation-button-holder"></div>
                    </div>
                </div>

                <div style="margin-top: 10px; padding: 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2)); display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap;">
                    <div style="min-width: 220px; flex: 1; display: flex; align-items: center; gap: 14px;">
                        <div id="rovalra-custom-profile-badge-icon-holder" aria-label="${ui('profileBadge.iconLabel')}"></div>
                        <div>
                            <h3 style="color: var(--rovalra-main-text-color); margin: 0 0 5px 0; font-size: 18px;">${ui('profileBadge.title')}</h3>
                            <p style="color: var(--rovalra-secondary-text-color); margin: 0; font-size: 14px;">${ui('profileBadge.description')}</p>
                        </div>
                    </div>
                    <div style="flex-shrink: 0;">
                        <div id="rovalra-custom-profile-badge-button-holder"></div>
                    </div>
                </div>

                <div style="margin-top: 10px; padding: 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2)); display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap;">
                    <div style="min-width: 220px; flex: 1; display: flex; align-items: center; gap: 14px;">
                        <img src="${GITHUB_SPONSOR_BADGE_IMAGE_URL}" alt="${ui('githubSponsorBadge.title')}" style="width: 52px; height: 52px; object-fit: contain; flex-shrink: 0;" />
                        <div>
                            <h3 style="color: var(--rovalra-main-text-color); margin: 0 0 5px 0; font-size: 18px;">${ui('githubSponsorBadge.title')}</h3>
                            <p style="color: var(--rovalra-secondary-text-color); margin: 0; font-size: 14px;">${ui('githubSponsorBadge.description')}</p>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 10px;">
                    <h3 style="color: var(--rovalra-main-text-color); margin-bottom: 10px; font-size: 18px;">${ts('settings.donatorPerks.perkTiers')}</h3>
                    ${getDonatorPerksComparisonHtml(themeColors)}
                </div>

                <div style="margin-top: 25px;">
                    <div class="rovalra-github-sponsors-section">
                        <h3 class="rovalra-donator-section-heading rovalra-github-sponsors-heading">
                            <a class="rovalra-github-sponsors-link" href="${GITHUB_SPONSORS_URL}" target="_blank" rel="noopener noreferrer">${ui('donation.githubSponsors')}</a>
                            <img class="rovalra-github-sponsors-blush" src="${assets.blush}" alt="" aria-hidden="true" />

                        </h3>
                        <div id="rovalra-github-sponsors" aria-label="${ui('donation.githubSponsors')}"></div>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                        <h3 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 18px;">${ui('donation.topDonators')}</h3>
                        <div id="rovalra-anon-toggle-container"></div>
                    </div>
                    <div id="rovalra-top-donators"></div>
                </div>
            </div>`;
        },
    },
    {
        id: 'whatsNew',
        get text() {
            return ts('settings.tabs.whatsNew');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 15px; color: var(--rovalra-main-text-color) !important;">${ui('whatsNew.title')}</h2>
                <div id="rovalra-whatsnew-container" style="color: var(--rovalra-secondary-text-color);">${ui('whatsNew.loading')}</div>
            </div>`;
        },
    },
    {
        id: 'privateServers',
        get text() {
            return ts('settings.tabs.privateServers');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 15px; color: var(--rovalra-main-text-color) !important;">${ui('privateServers.title')}</h2>
                <div id="rovalra-privateservers-container" style="color: var(--rovalra-secondary-text-color);">${ui('privateServers.loading')}</div>
            </div>`;
        },
    },
    {
        id: 'performance',
        get text() {
            return ts('settings.tabs.performance');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 15px; color: var(--rovalra-main-text-color) !important;">${ui('performance.title')}</h2>
                <div id="rovalra-performance-container" style="color: var(--rovalra-secondary-text-color);">${ui('performance.loading')}</div>
            </div>`;
        },
    },
    {
        id: 'accountStanding',
        get text() {
            return ts('settings.tabs.accountStanding');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 15px; color: var(--rovalra-main-text-color) !important;">${ts('settings.tabs.accountStanding')}</h2>
                <div id="rovalra-account-standing-container">
                    <div style="color: var(--rovalra-secondary-text-color);">${ts('settings.credits.loadingContributors')}</div>
                </div>
            </div>`;
        },
    },
    {
        id: 'settings',
        get text() {
            return ts('settings.tabs.settings');
        },
        get content() {
            return `
            <div id="settings-content" style="padding: 0; background-color: transparent;">
                <div id="setting-section-buttons" style="display: flex; margin-bottom: 25px;"></div>
                <div id="setting-section-content" style="padding: 5px;"></div>
            </div>`;
        },
    },
];

function openAppealOverlay(onSave) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingTop: '5px',
        alignItems: 'center',
    });

    const { container: inputContainer, input } = createStyledInput({
        id: 'rovalra-appeal-message-input',
        label: ui('appeal.messageLabel'),
        value: '',
        multiline: true,
    });
    inputContainer.style.width = '100%';
    input.minLength = 20;
    input.maxLength = 3000;

    container.appendChild(inputContainer);

    const errorDisplay = document.createElement('p');
    errorDisplay.className = 'text-error';
    Object.assign(errorDisplay.style, {
        display: 'none',
        marginTop: '-4px',
        marginBottom: '0',
    });
    container.appendChild(errorDisplay);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary-md';
    submitBtn.textContent = ui('appeal.submit');

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-control-md';
    cancelBtn.textContent = ui('common.cancel');

    const { close } = createOverlay({
        title: ui('appeal.title'),
        bodyContent: container,
        actions: [cancelBtn, submitBtn],
        maxWidth: '450px',
        preventBackdropClose: true,
    });

    cancelBtn.onclick = close;
    submitBtn.onclick = async () => {
        const appealMessage = input.value.trim();
        if (appealMessage.length < 20 || appealMessage.length > 3000) {
            errorDisplay.textContent = ui('appeal.invalidLength');
            errorDisplay.style.display = 'block';
            return;
        }
        submitBtn.disabled = true;
        const success = await onSave(appealMessage);
        if (success) {
            close();
            const standingContainer = document.getElementById(
                'rovalra-account-standing-container',
            );
            if (standingContainer) renderAccountStanding(standingContainer);
        } else {
            submitBtn.disabled = false;
            errorDisplay.textContent = ui('appeal.submitFailed');
            errorDisplay.style.display = 'block';
        }
    };
}

async function renderAccountStanding(container) {
    container.innerHTML = '';

    const discordCard = document.createElement('div');
    discordCard.className = 'rovalra-account-standing-card';
    discordCard.style.cssText =
        'background-color: var(--rovalra-container-background-color); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 24px;';
    container.appendChild(discordCard);

    // Initial instant render assuming good standing
    discordCard.innerHTML = DOMPurify.sanitize(
        `
        <div style="display: flex; align-items: flex-start; gap: 20px;">
            <div class="standing-status-icon-bg" style="width: 48px; height: 48px; border-radius: 50%; background-color: #23a55a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background-color 0.3s;">
                <icon size="large" style="transform: translate(1px, 1px)">check-large</icon>
            </div>
            <div style="flex: 1;">
                <h3 class="standing-status-title" style="margin: 0 0 8px 0; font-size: 18px; color: var(--rovalra-main-text-color);">${ui('standing.goodTitle')}</h3>
                <p class="standing-status-desc" style="margin: 0; font-size: 14px; color: var(--rovalra-secondary-text-color); line-height: 1.5;">${ui('standing.goodDescription')}</p>
            </div>
        </div>
        <div style="padding: 20px 10px 40px 10px; border-radius: 8px; margin-top: 10px;">
            <div style="height: 12px; background: rgba(128,128,128,0.2); border-radius: 6px; position: relative; margin-bottom: 25px;">
                <div class="standing-status-fill" style="position: absolute; left: 0; top: 0; height: 100%; width: 0%; background: #23a55a; border-radius: 6px; transition: width 0.5s ease, background-color 0.3s;"></div>
                ${ACCOUNT_STANDING_LEVELS.map((level, index) => {
                    const leftPos =
                        (index / (ACCOUNT_STANDING_LEVELS.length - 1)) * 100;
                    return `
                        <div class="standing-status-dot" data-index="${index}" style="position: absolute; left: ${leftPos}%; top: 50%; transform: translate(-50%, -50%); width: 20px; height: 20px; border-radius: 50%; background: ${index === 0 ? level.color : '#4f545c'}; border: 4px solid var(--rovalra-container-background-color); z-index: 2; transition: background 0.3s;"></div>
                        <div class="standing-status-label" data-index="${index}" style="font-size: 12px; font-weight: 600; color: ${index === 0 ? 'var(--rovalra-main-text-color)' : 'var(--rovalra-secondary-text-color)'}; opacity: ${index === 0 ? '1' : '0.5'}; text-align: center; width: 60px; margin-left: -30px; position: absolute; left: ${leftPos}%; margin-top: 15px; transition: color 0.3s, opacity 0.3s;">${ui(level.labelKey)}</div>
                    `;
                }).join('')}
            </div>
        </div>
        <div class="standing-policy-anchor"></div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--rovalra-border-color); font-size: 12px; color: var(--rovalra-secondary-text-color); line-height: 1.5;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--rovalra-secondary-text-color);">${ui('standing.policyTitle')}</div>
            ${ui('standing.policyDescription', { termsLink: '<a href="https://www.rovalra.com/tou/" target="_blank" style="color: inherit; text-decoration: underline;">RoValra Terms of Service</a>' })}
        </div>
    `,
        { ...CUSTOM_ADDED_TAGS },
    );

    if (standingCache) {
        updateAccountStandingUI(
            discordCard,
            standingCache,
            ACCOUNT_STANDING_LEVELS,
        );
        return;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderation/status',
            method: 'GET',
            isRovalraApi: true,
        });

        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();
        standingCache = data;
        updateAccountStandingUI(discordCard, data, ACCOUNT_STANDING_LEVELS);
    } catch (err) {
        console.error('RoValra: Failed to load standing data', err);
    }
}

function updateAccountStandingUI(discordCard, data, levels) {
    const activeModeration = getActiveModeration(data);
    const currentStatus = activeModeration?.moderation_status ?? 0;
    const isGoodStanding = currentStatus === 0;
    const isTemporary = Boolean(activeModeration?.moderation_expires_at);

    const iconBg = discordCard.querySelector('.standing-status-icon-bg');
    const iconEl = iconBg.querySelector('icon');
    const statusTitle = discordCard.querySelector('.standing-status-title');
    const statusDesc = discordCard.querySelector('.standing-status-desc');
    const fill = discordCard.querySelector('.standing-status-fill');
    const dots = discordCard.querySelectorAll('.standing-status-dot');
    const labels = discordCard.querySelectorAll('.standing-status-label');
    const policyAnchor = discordCard.querySelector('.standing-policy-anchor');

    discordCard
        .querySelectorAll('.standing-dynamic-section')
        .forEach((section) => section.remove());

    if (isGoodStanding) {
        iconBg.style.backgroundColor = '#23a55a';
        ChangeIcon(iconEl, { icon: 'check-large' });
        statusTitle.textContent = ui('standing.goodTitle');
        statusDesc.textContent = ui('standing.goodDescription');
    }

    if (!isGoodStanding) {
        iconBg.style.backgroundColor = '#f23f43';
        ChangeIcon(iconEl, { icon: 'x' });
        statusTitle.textContent = isTemporary
            ? ui('standing.temporaryTitle')
            : ui('standing.violationTitle');
        statusDesc.textContent = ui('standing.statusDescription', {
            status: getModerationStatusLabel(currentStatus),
        });
    }

    fill.style.width = `${(currentStatus / (levels.length - 1)) * 100}%`;
    fill.style.backgroundColor = levels[currentStatus]?.color || '#808080';

    dots.forEach((dot, index) => {
        dot.style.background =
            index <= currentStatus ? levels[index].color : '#4f545c';
    });

    labels.forEach((label, index) => {
        const isCurrent = index === currentStatus;
        label.style.color = isCurrent
            ? 'var(--rovalra-main-text-color)'
            : 'var(--rovalra-secondary-text-color)';
        label.style.opacity = isCurrent ? '1' : '0.5';
    });

    if (!isGoodStanding) {
        const reason = activeModeration.moderation_reason;
        const modContent = activeModeration.moderated_content_history || [];

        const automatedHtml = activeModeration.automated
            ? `<div style="display: inline-block; margin-top: 8px; padding: 2px 6px; background: #0084ff; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">${ui('standing.automatedAction')}</div>`
            : `<div style="display: inline-block; margin-top: 8px; padding: 2px 6px; background: rgba(128, 128, 128, 0.2); color: var(--rovalra-secondary-text-color); border-radius: 4px; font-size: 12px; font-weight: 600;">${ui('standing.manualReview')}</div>`;

        const disabledFeatures =
            (typeof reason === 'object' && reason?.disabled_features) || [];

        const disabledFeaturesHtml =
            disabledFeatures.length > 0
                ? `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--rovalra-border-color);">
                <div style="color: #f23f43; font-weight: 600; font-size: 13px; margin-bottom: 8px;">${ui('standing.disabledFeatures')}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${disabledFeatures
                        .map(
                            (feature) =>
                                `<div style="background: rgba(242, 63, 67, 0.1); padding: 4px 10px; border-radius: 6px; color: #f23f43; font-size: 11px; font-weight: 600; text-transform: capitalize;">${feature}</div>`,
                        )
                        .join('')}
                </div>
            </div>`
                : '';

        const modContentHtml =
            modContent.length > 0
                ? `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--rovalra-border-color);">
                <div style="color: #f23f43; font-weight: 600; font-size: 13px; margin-bottom: 8px;">${ui('standing.moderatedContent')}</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${modContent
                        .map(
                            (item) => `
                        <div style="background: rgba(0,0,0,0.1); padding: 8px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--rovalra-secondary-text-color); font-size: 12px; margin-bottom: 4px;">${item.config_key}</div>
                            <div style="font-size: 13px; color: var(--rovalra-main-text-color); word-break: break-all;">${item.content_value}</div>
                        </div>
                    `,
                        )
                        .join('')}
                </div>
            </div>`
                : '';

        const reasonHtml = document.createElement('div');
        reasonHtml.className = 'standing-dynamic-section';
        const violationColor = levels[currentStatus]?.color || '#f23f43';
        reasonHtml.style.cssText =
            'margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--rovalra-border-color);';
        reasonHtml.innerHTML = DOMPurify.sanitize(`
            <div style="font-size: 14px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 8px;">${ui('standing.violationDetails')}</div>
            <div style="background: rgba(0,0,0,0.05); padding: 15px; border-radius: 8px; border-left: 4px solid ${violationColor};">
                <div style="font-weight: 600; color: var(--rovalra-main-text-color); margin-bottom: 4px;">${typeof reason === 'string' ? reason : reason?.title || ui('standing.unknownReason')}</div>
                ${reason?.description ? `<div style="font-size: 13px; color: var(--rovalra-secondary-text-color);">${reason.description}</div>` : ''}
                ${automatedHtml}
                ${disabledFeaturesHtml}
                ${modContentHtml}
                <div style="margin-top: 10px; font-size: 11px; opacity: 0.7;" class="standing-mod-date">${ui('standing.moderated')}: </div>
                ${
                    isTemporary
                        ? `<div style="margin-top: 6px; font-size: 11px; opacity: 0.85;" class="standing-expiry-date">${ui('standing.temporaryExpires')}: </div>`
                        : ''
                }
            </div>
        `);
        const dateContainer = reasonHtml.querySelector('.standing-mod-date');
        if (activeModeration.moderated_at)
            dateContainer.appendChild(
                createInteractiveTimestamp(activeModeration.moderated_at),
            );
        const expiryContainer = reasonHtml.querySelector(
            '.standing-expiry-date',
        );
        if (expiryContainer && activeModeration.moderation_expires_at) {
            expiryContainer.appendChild(
                createInteractiveTimestamp(
                    activeModeration.moderation_expires_at,
                ),
            );
        }
        discordCard.insertBefore(reasonHtml, policyAnchor);

        if (
            data.appeal &&
            data.appeal.appeal_status !== null &&
            data.appeal.appeal_status !== 0
        ) {
            const statusColors = ['#808080', '#f0b232', '#f23f43', '#23a55a'];
            const statusColor =
                statusColors[data.appeal.appeal_status] ||
                'var(--rovalra-secondary-text-color)';

            const appealSection = document.createElement('div');
            appealSection.className = 'standing-dynamic-section';
            appealSection.style.cssText = `padding: 15px; background: rgba(0,0,0,0.05); border-radius: 8px; border-left: 4px solid ${statusColor};`;
            appealSection.innerHTML = DOMPurify.sanitize(`
                <div style="font-size: 14px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 8px;">${ui('standing.appealCase')}</div>
                <div style="font-size: 14px; color: var(--rovalra-main-text-color); margin-bottom: 12px;">${ui('standing.status')}: <strong style="color: ${statusColor};">${ui(APPEAL_STATUSES[data.appeal.appeal_status])}</strong></div>

                <div style="margin-bottom: 10px;">
                    <div style="font-size: 13px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 2px;">${ui('standing.yourMessage')}</div>
                    <div style="font-size: 13px; color: var(--rovalra-main-text-color); opacity: 0.9;">${data.appeal.appeal_message || ui('common.notAvailable')}</div>
                </div>

                <div style="font-size: 13px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 2px;">${ui('standing.response')}</div>
                <div style="font-size: 13px; color: var(--rovalra-secondary-text-color);">${data.appeal.appeal_response || ui('standing.reviewingAppeal')}</div>
            `);
            discordCard.insertBefore(appealSection, policyAnchor);
        }

        if (data.appeal?.appeal_status === 0) {
            const btn = document.createElement('button');
            btn.className = 'btn-secondary-md';
            btn.classList.add('standing-dynamic-section');
            btn.textContent = ui('standing.appealDecision');
            btn.style.marginTop = '20px';
            btn.style.width = '100%';
            btn.onclick = () =>
                openAppealOverlay(async (msg) => {
                    try {
                        const res = await callRobloxApi({
                            subdomain: 'apis',
                            endpoint: '/v1/auth/moderation/appeal',
                            method: 'POST',
                            isRovalraApi: true,
                            body: { message: msg },
                        });
                        return res.ok;
                    } catch (e) {
                        return false;
                    }
                });
            discordCard.insertBefore(btn, policyAnchor);
        }
    }
}

function handleGlobalDomChange(event) {
    if (document.getElementById('settings-popover-menu')) {
        addPopoverButton();
    } else if (window.rovalraPopoverButtonAdded) {
        window.rovalraPopoverButtonAdded = false;
    }

    debouncedAddCustomButton();
    debouncedAddPopoverButton();

    const mutationsList = event.detail?.mutationsList;
    if (!mutationsList) return;

    const shouldUpdateTheme = mutationsList.some(
        (mutation) =>
            mutation.type === 'childList' &&
            mutation.addedNodes.length > 0 &&
            Array.from(mutation.addedNodes).some(
                (node) =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node.matches(
                        '[data-theme-dependent], .setting, .menu-option, #content-container',
                    ) ||
                        node.querySelector(
                            '[data-theme-dependent], .setting, .menu-option, #content-container',
                        )),
            ),
    );

    if (shouldUpdateTheme) {
        debouncedApplyTheme();
    }
}

export async function updateContent(buttonInfo, contentContainer) {
    if (
        typeof buttonInfo !== 'object' ||
        buttonInfo === null ||
        !buttonInfo.content
    )
        return;

    const buttonId = buttonInfo.id;
    const sanitizeConfig = { ADD_URI_SCHEMES: ['chrome-extension'] };

    // Keep the What's New sidebar badge in sync whenever a settings tab
    // renders; after the first fetch this is served from cache.
    refreshWhatsNewSidebarBadge();

    if (
        buttonId === 'info' ||
        buttonId === 'credits' ||
        buttonId === 'accountStanding' ||
        buttonId === 'donatorPerks' ||
        buttonId === 'whatsNew' ||
        buttonId === 'privateServers' ||
        buttonId === 'performance'
    ) {
        ((contentContainer.innerHTML = `
            <div id="settings-content" style="padding: 0; background-color: transparent !important;">
                <div id="setting-section-content" style="padding: 5px;">
                    <div id="info-credits-background-wrapper" class="setting" style="margin-bottom: 15px;">
                        ${buttonInfo.content}
                    </div>
                </div>
                </div>`), //verified
            sanitizeConfig);
    } else {
        contentContainer.innerHTML = safeHtml(
            buttonInfo.content,
            sanitizeConfig,
        ); //verified
    }

    if (buttonId === 'info') {
        const settingsSection = contentContainer.querySelector(
            '#setting-section-content',
        );
        const rovalraSettings = SETTINGS_CONFIG.RoValra?.settings || {};

        if (settingsSection && Object.keys(rovalraSettings).length > 0) {
            const rovalraSettingsFragment = document.createDocumentFragment();

            Object.entries(rovalraSettings).forEach(
                ([settingName, setting]) => {
                    if (!setting.hidden) {
                        rovalraSettingsFragment.appendChild(
                            generateSingleSettingHTML(settingName, setting),
                        );
                    }
                },
            );

            if (rovalraSettingsFragment.childNodes.length > 0) {
                settingsSection.appendChild(rovalraSettingsFragment);
                await initSettings(contentContainer);
            }
        }
    }

    if (buttonId === 'credits') {
        loadContributors();
    }

    if (buttonId === 'accountStanding') {
        const container = contentContainer.querySelector(
            '#rovalra-account-standing-container',
        );
        if (container) {
            renderAccountStanding(container);
        }
    }

    if (buttonId === 'donatorPerks') {
        renderDonatorPerksDonationButton(contentContainer);
        renderCustomProfileBadgePurchaseButton(contentContainer);
        renderDonatorPerkStatusPills(contentContainer);

        const badgesResponse = await syncDonatorTier();
        const userTier = getCurrentUserTierSync();
        if (userTier > 0) {
            const userId = await getAuthenticatedUserId();
            if (userId) {
                const thumbs = await getBatchThumbnails(
                    [userId],
                    'AvatarHeadshot',
                    '60x60',
                );
                const thumbData = thumbs[0];
                const userThumbUrl = thumbData?.imageUrl;
                const tierContainer = contentContainer.querySelector(
                    `#donator-tier-${userTier}-header`,
                );

                if (tierContainer) {
                    const currentTierPill = createPill(
                        ts('settings.donatorPerks.currentTier'),
                        null,
                        { size: 'small' },
                    );
                    currentTierPill.classList.add(
                        'rovalra-donator-current-tier-pill',
                    );
                    tierContainer.appendChild(currentTierPill);
                }

                if (userThumbUrl && tierContainer) {
                    const tierCopy = tierContainer.querySelector(
                        '.rovalra-donator-tier-copy',
                    );
                    const tierBadge = document.createElement('span');
                    tierBadge.dataset.rovalraSkipUsdEstimate = 'true';
                    tierBadge.style.cssText =
                        'margin-top: 6px; display: inline-flex; align-items: center; gap: 5px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); padding: 2px 7px 2px 2px; border-radius: 16px; border: 1px solid var(--rovalra-border-color); color: var(--rovalra-main-text-color); white-space: nowrap; width: fit-content;';

                    const img = document.createElement('img');
                    img.src = userThumbUrl;
                    img.style.cssText =
                        'width: 19px; height: 19px; border-radius: 50%; flex-shrink: 0;';
                    tierBadge.appendChild(img);

                    const totalDonated =
                        getTotalDonatedFromBadgesResponse(badgesResponse);
                    let totalDonatedLabel = null;
                    if (totalDonated !== null) {
                        totalDonatedLabel = totalDonated.toLocaleString();
                        const donationTotal = document.createElement('span');
                        const robuxIcon = document.createElement('span');
                        robuxIcon.className = 'icon-robux-16x16';
                        robuxIcon.style.marginRight = '2px';
                        donationTotal.append(robuxIcon, totalDonatedLabel);
                        donationTotal.style.cssText =
                            'display: inline-flex; align-items: center; gap: 1px; color: var(--rovalra-main-text-color); font-size: 11px; font-weight: 700;';
                        tierBadge.appendChild(donationTotal);
                    }
                    addTooltip(
                        tierBadge,
                        totalDonatedLabel
                            ? ui('donation.totalDonated', {
                                  amount: totalDonatedLabel,
                              })
                            : ui('donation.tierTooltip'),
                        { position: 'top' },
                    );
                    (tierCopy || tierContainer).appendChild(tierBadge);
                }
            }
        }

        loadGithubSponsors();
        loadTopDonators();
    }

    if (buttonId === 'whatsNew') {
        const whatsNewContainer = contentContainer.querySelector(
            '#rovalra-whatsnew-container',
        );
        if (whatsNewContainer) {
            renderWhatsNew(whatsNewContainer);
        }
    }

    if (buttonId === 'privateServers') {
        const privateServersContainer = contentContainer.querySelector(
            '#rovalra-privateservers-container',
        );
        if (privateServersContainer) {
            renderPrivateServerManager(privateServersContainer);
        }
    }

    if (buttonId === 'performance') {
        const performanceContainer = contentContainer.querySelector(
            '#rovalra-performance-container',
        );
        if (performanceContainer) {
            renderPerformance(performanceContainer);
        }
    }

    const rovalraHeader = document.querySelector(
        '#react-user-account-base > h1',
    );
    if (rovalraHeader) {
        rovalraHeader.style.setProperty(
            'color',
            'var(--rovalra-main-text-color)',
            'important',
        );
    }
}

export async function handleSearch(event) {
    const query =
        event.target && event.target.value
            ? event.target.value.toLowerCase().trim()
            : '';

    const contentContainer = document.querySelector('#content-container');
    if (!contentContainer) return;

    const url = new URL(window.location.href);
    if (query) {
        url.searchParams.set('q', query);
    } else {
        url.searchParams.delete('q');
    }

    if (url.searchParams.get('rovalra') === 'search') {
        window.history.replaceState(
            null,
            '',
            url.pathname + url.search + window.location.hash,
        );
    }

    document
        .querySelectorAll('#unified-menu .menu-option-content')
        .forEach((el) => {
            el.classList.remove('active');
            el.removeAttribute('aria-current');
        });

    if (query.length < 2) {
        contentContainer.innerHTML = DOMPurify.sanitize(
            `<div id="settings-content" style="padding: 15px; text-align: center; color: var(--rovalra-main-text-color);">${ts('settings.search.minLength')}</div>`,
        );
        await applyTheme();
        return;
    }

    const searchResults = [];
    const queryNoSpaces = query.replace(/\s+/g, '');

    for (const categoryName in SETTINGS_CONFIG) {
        if (!document.getElementById(`${categoryName.toLowerCase()}-tab`)) {
            continue;
        }

        const category = SETTINGS_CONFIG[categoryName];
        for (const [settingName, settingDef] of Object.entries(
            category.settings,
        )) {
            if (settingDef.hidden) continue;

            const label = (
                Array.isArray(settingDef.label)
                    ? settingDef.label.join(' ')
                    : settingDef.label || ''
            ).toLowerCase();
            const description = (
                Array.isArray(settingDef.description)
                    ? settingDef.description.join(' ')
                    : settingDef.description || ''
            ).toLowerCase();
            const fullText = `${label} ${description}`;

            let isMatch =
                fullText.includes(query) ||
                fullText.replace(/\s+/g, '').includes(queryNoSpaces) ||
                settingName.toLowerCase() === query;

            if (!isMatch) {
                const words = fullText.split(/\s+/);
                const threshold = query.length > 5 ? 2 : 1;
                isMatch = words.some(
                    (word) => getLevenshteinDistance(query, word) <= threshold,
                );
            }

            if (!isMatch && settingDef.childSettings) {
                for (const [childName, childDef] of Object.entries(
                    settingDef.childSettings,
                )) {
                    if (childDef.hidden) continue;

                    const childLabel = (
                        Array.isArray(childDef.label)
                            ? childDef.label.join(' ')
                            : childDef.label || ''
                    ).toLowerCase();
                    const childDesc = (
                        Array.isArray(childDef.description)
                            ? childDef.description.join(' ')
                            : childDef.description || ''
                    ).toLowerCase();
                    if (
                        `${childLabel} ${childDesc}`.includes(query) ||
                        childName.toLowerCase() === query
                    ) {
                        isMatch = true;
                        break;
                    }
                }
            }

            if (
                isMatch &&
                !searchResults.some((res) => res.name === settingName)
            ) {
                searchResults.push({
                    category: category.title,
                    name: settingName,
                    config: settingDef,
                });
            }
        }
    }

    if (searchResults.length === 0) {
        contentContainer.innerHTML = safeHtml`<div id="settings-content" style="padding: 15px; text-align: center; color: var(--rovalra-main-text-color);">${ts('settings.search.noResults', { query })}</div>`;
    } else {
        const groupedResults = searchResults.reduce((acc, setting) => {
            if (!acc[setting.category]) acc[setting.category] = [];
            acc[setting.category].push(setting);
            return acc;
        }, {});

        contentContainer.innerHTML = '';

        const resultsWrapper = document.createElement('div');
        resultsWrapper.id = 'setting-section-content';
        resultsWrapper.style.padding = '5px';

        for (const categoryTitle in groupedResults) {
            const header = document.createElement('h2');
            header.className = 'settings-category-header';
            header.style.cssText =
                'margin-left: 5px; margin-bottom: 10px; color: var(--rovalra-main-text-color);'; // Verified
            header.textContent = categoryTitle;
            resultsWrapper.appendChild(header);

            for (const setting of groupedResults[categoryTitle]) {
                const settingElement = generateSingleSettingHTML(
                    setting.name,
                    setting.config,
                    REGIONS,
                );

                if (settingElement instanceof Node) {
                    resultsWrapper.appendChild(settingElement);
                } else {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = safeHtml(settingElement); // Verified
                    while (tempDiv.firstChild) {
                        resultsWrapper.appendChild(tempDiv.firstChild);
                    }
                }
            }
        }

        contentContainer.appendChild(resultsWrapper);
    }

    await initSettings(contentContainer);
    await applyTheme();
}

document.addEventListener('click', (event) => {
    const target = event.target;

    const perkLink = target.closest('.rovalra-perk-link');
    if (perkLink) {
        event.preventDefault();
        const settingName = perkLink.dataset.setting;
        const url = new URL(window.location.href);
        url.searchParams.set('rovalra', 'search');
        url.searchParams.set('q', settingName);
        window.location.href = url.pathname + url.search + '#!/search';
        return;
    }

    if (target.id === 'export-rovalra-settings') return exportSettings();
    if (target.id === 'import-rovalra-settings') return importSettings();
    if (target.id === 'export-rovalra-profile-notes')
        return exportProfileNotes();
    if (target.id === 'import-rovalra-profile-notes')
        return importProfileNotes();
    if (target.matches('.tab-button, .setting-section-button')) return;
});

function onPopoverRemoved() {
    window.rovalraPopoverButtonAdded = false;
}

async function initializeExtension() {
    getRegionData()
        .then((data) => {
            REGIONS = data.regions;
        })
        .catch((e) => console.warn('Failed to load region data:', e));

    await applyTheme();

    if (window.location.href.includes('rovalra=')) {
        injectStylesheet(
            'css/settings_layout.css',
            'rovalra-settings-layout-css',
        );
    }

    await buildSettingsKey();

    addCustomButton(debouncedAddPopoverButton);
    addPopoverButton();

    initializeSettingsEventListeners();
    initBulkUnblock();

    document.addEventListener('roblox-dom-changed', handleGlobalDomChange);

    observeElement('#settings-popover-menu', addPopoverButton, {
        onRemove: onPopoverRemoved,
    });
    observeElement('ul.menu-vertical[role="tablist"]', () =>
        addCustomButton(debouncedAddPopoverButton),
    );
    observeElement(
        '#unified-menu',
        () => document.body.classList.add('rovalra-settings-page'),
        {
            onRemove: () =>
                document.body.classList.remove('rovalra-settings-page'),
        },
    );

    await checkRoValraPage();
}

export function init() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }
}

window.addEventListener('beforeunload', () => {
    document.removeEventListener('roblox-dom-changed', handleGlobalDomChange);
});

function initializeHeartbeatSpoofer() {
    const originalFetch = window.fetch;
    let pulseInterval = null;
    let spoofingMode = 'off';

    const sendSpoofedHeartbeat = async () => {
        let locationInfoPayload;

        if (spoofingMode === 'studio') {
            locationInfoPayload = { studioLocationInfo: { placeId: 0 } };
        } else {
            return;
        }

        const spoofedPulseRequest = {
            clientSideTimestampEpochMs: Date.now(),
            locationInfo: locationInfoPayload,
            sessionInfo: { sessionId: crypto.randomUUID() },
        };

        try {
            await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/user-heartbeats-api/pulse',
                method: 'POST',
                body: spoofedPulseRequest,
                headers: { 'RoValra-Internal': 'true' },
                useBackground: true,
            });
            console.log(
                `RoValra: Spoofed heartbeat sent. Mode: ${spoofingMode}`,
            );
        } catch (error) {
            console.error('RoValra: Failed to send spoofed heartbeat.', error);
        }
    };

    const startSpoofingTimer = () => {
        if (pulseInterval) return;
        console.log(`RoValra: Starting spoofer timer (${spoofingMode}).`);
        pulseInterval = setInterval(async () => {
            if (spoofingMode === 'studio') {
                sendSpoofedHeartbeat();
            }
        }, 30000);
    };

    const stopSpoofingTimer = () => {
        if (pulseInterval) {
            console.log('RoValra: Stopping spoofer timer.');
            clearInterval(pulseInterval);
            pulseInterval = null;
        }
    };

    const updateSpoofingMode = (settings) => {
        chrome.runtime.sendMessage({
            action: 'updateOfflineRule',
            enabled: settings.spoofAsOffline,
        });
        chrome.runtime.sendMessage({
            action: 'updateEarlyAccessRule',
            enabled: settings.EarlyAccessProgram,
        });

        if (settings.spoofAsOffline) spoofingMode = 'offline';
        else if (settings.spoofAsStudio) spoofingMode = 'studio';
        else spoofingMode = 'off';

        if (spoofingMode === 'studio') startSpoofingTimer();
        else stopSpoofingTimer();
    };

    const relevantSettings = [
        'spoofAsStudio',
        'spoofAsOffline',
        'EarlyAccessProgram',
    ];
    chrome.storage.local.get(relevantSettings, updateSpoofingMode);

    chrome.storage.onChanged.addListener((changes) => {
        if (relevantSettings.some((setting) => changes[setting])) {
            chrome.storage.local.get(relevantSettings, (result) => {
                if (changes.LaunchDelay) {
                    const toggle = document.querySelector(
                        '#LaunchDelay-enabled',
                    );
                    if (toggle) {
                        toggle.checked = changes.LaunchDelay.newValue > 0;
                        updateConditionalSettingsVisibility(
                            document.body,
                            result,
                        );
                    }
                }
                updateSpoofingMode(result);
            });
        }
    });

    window.fetch = async function (...args) {
        const url = args[0] ? args[0].toString() : '';
        let isInternal = false;

        if (args.length > 1 && args[1] && args[1].headers) {
            const originalOptions = args[1];
            const newOptions = { ...originalOptions };

            let hasHeader = false;

            if (newOptions.headers instanceof Headers) {
                if (newOptions.headers.get('RoValra-Internal') === 'true') {
                    hasHeader = true;
                    newOptions.headers = new Headers(newOptions.headers);
                    newOptions.headers.delete('RoValra-Internal');
                }
            } else if (
                typeof newOptions.headers === 'object' &&
                !Array.isArray(newOptions.headers)
            ) {
                if (newOptions.headers['RoValra-Internal'] === 'true') {
                    hasHeader = true;
                    newOptions.headers = { ...newOptions.headers };
                    delete newOptions.headers['RoValra-Internal'];
                }
            }

            if (hasHeader) {
                isInternal = true;
                args[1] = newOptions;
            }
        }

        if (
            url.includes('apis.roblox.com/user-heartbeats-api/pulse') &&
            spoofingMode !== 'off' &&
            !isInternal
        ) {
            return new Response(null, { status: 200, statusText: 'OK' });
        }

        return originalFetch.apply(this, args);
    };

    console.log('RoValra: Proactive heartbeat spoofer initialized.');
}

initializeHeartbeatSpoofer();
loadDatacenterMap();
