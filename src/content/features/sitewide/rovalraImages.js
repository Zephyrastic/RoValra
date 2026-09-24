// Roblox's CSP img-src does not allow rovalra.com, so <img> elements
// pointing at RoValra-hosted assets render as broken images in both
// Chromium and Firefox. Swap their src for a background-fetched data: URI
// (img-src allows data:) as soon as they enter the DOM.

import { rovalraImage } from '../../core/utils/rovalraImage.js';

const ROVALRA_IMAGE_PATTERN = /^https:\/\/([a-z0-9-]+\.)*rovalra\.com\//i;

function swapImage(img) {
    if (!img || img.tagName !== 'IMG') return;

    const src = img.src;
    if (!src || src.startsWith('data:')) return;
    if (!ROVALRA_IMAGE_PATTERN.test(src)) return;

    rovalraImage(src)
        .then((dataUri) => {
            // Re-check: the element may have been re-pointed meanwhile.
            if (img.src === src) {
                img.src = dataUri;
            }
        })
        .catch(() => {
            // Keep the original src; it already fails via CSP anyway.
        });
}

function swapIn(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'IMG') swapImage(root);
    root.querySelectorAll('img').forEach(swapImage);
}

export function init() {
    swapIn(document.documentElement);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                swapImage(mutation.target);
            } else if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(swapIn);
            }
        }
    });

    observer.observe(document.documentElement || document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src'],
    });
}
