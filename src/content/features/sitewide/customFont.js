export function init() {
    chrome.storage.local.get(['Customfont', 'Customfontlink'], (result) => {
        if (!result.Customfont) return;

        const fontLink = result.Customfontlink;
        if (!fontLink || fontLink.trim() === '') return;

        applyCustomFont(fontLink.trim());
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.Customfont || changes.Customfontlink) {
            chrome.storage.local.get(['Customfont', 'Customfontlink'], (updated) => {
                if (!updated.Customfont) {
                    removeCustomFont();
                } else if (updated.Customfontlink) {
                    applyCustomFont(updated.Customfontlink.trim());
                }
            });
        }
    });
}

function resolveGoogleFont(input) {
    input = input.trim();

    // @import url('...')
    const importMatch = input.match(/@import\s+url\(['"]?(https?:\/\/fonts\.googleapis\.com\/[^'")\s]+)['"]?\)/);
    if (importMatch) {
        const importUrl = importMatch[1];
        const familyMatch = importUrl.match(/family=([^&:;]+)/);
        const fontFamily = familyMatch
            ? decodeURIComponent(familyMatch[1]).replace(/\+/g, ' ')
            : null;
        return { importUrl, fontFamily };
    }

    // Raw googleapis URL
    if (input.startsWith('https://fonts.googleapis.com/')) {
        const familyMatch = input.match(/family=([^&:;]+)/);
        const fontFamily = familyMatch
            ? decodeURIComponent(familyMatch[1]).replace(/\+/g, ' ')
            : null;
        return { importUrl: input, fontFamily };
    }

    // fonts.google.com specimen page
    const specimenMatch = input.match(/fonts\.google\.com\/specimen\/([^?&#]+)/);
    if (specimenMatch) {
        const fontFamily = decodeURIComponent(specimenMatch[1]).replace(/\+/g, ' ');
        const encodedFamily = fontFamily.replace(/ /g, '+');
        const importUrl = `https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`;
        return { importUrl, fontFamily };
    }

    return null;
}

let applySequence = 0;

async function applyCustomFont(input) {
    const sequence = ++applySequence;
    removeCustomFont();

    const resolved = resolveGoogleFont(input);
    if (!resolved) {
        console.warn('[RoValra] customFont: Could not parse font input:', input);
        return;
    }

    const { importUrl, fontFamily } = resolved;

    // The @import stylesheet never arrives in some Firefox environments (the
    // same failure mode as the old fonts.googleapis.com icon <link>), so fetch
    // the Google Fonts CSS through the background script first — with every
    // font binary inlined as a data: URI — and fall back to a plain @import
    // if the proxy fails.
    let css = null;
    try {
        css = await fetchFontCssViaBackground(importUrl);
    } catch (err) {
        console.warn(
            '[RoValra] customFont: background font fetch failed, falling back to @import',
            err,
        );
    }

    // A newer storage change superseded this request while it was in flight.
    if (sequence !== applySequence) return;

    const style = document.createElement('style');
    style.id = 'rovalra-custom-font';
    const fontRule = `
        * {
            font-family: '${fontFamily}', sans-serif !important;
        }
    `;
    style.textContent = css ? `${css}\n${fontRule}` : `@import url('${importUrl}');\n${fontRule}`;

    document.head.appendChild(style);
}

function fetchFontCssViaBackground(importUrl) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { action: 'rovalraGoogleFontCss', url: importUrl },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (
                    !response ||
                    response.failed ||
                    typeof response.css !== 'string'
                ) {
                    reject(
                        new Error(
                            (response && response.error) ||
                                'Font CSS proxy failed',
                        ),
                    );
                    return;
                }
                resolve(response.css);
            },
        );
    });
}

function removeCustomFont() {
    const existing = document.getElementById('rovalra-custom-font');
    if (existing) existing.remove();
}