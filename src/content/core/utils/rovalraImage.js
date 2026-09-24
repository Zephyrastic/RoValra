const cache = new Map();

/**
 * Fetches a www.rovalra.com-hosted static asset through the background
 * script and resolves to a data: URI. Roblox's page CSP (img-src) blocks
 * rovalra.com image loads in both Chromium and Firefox, while data: URIs
 * are allowed — so consumers swap the src for the returned data URI.
 *
 * @param {string} url Absolute https://*.rovalra.com asset URL.
 * @returns {Promise<string>} data: URI for the asset.
 */
export function rovalraImage(url) {
    if (cache.has(url)) {
        return cache.get(url);
    }

    const promise = new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { action: 'rovalraImage', options: { url } },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (
                    !response ||
                    response.failed ||
                    typeof response.dataUri !== 'string'
                ) {
                    reject(
                        new Error(
                            (response && response.error) ||
                                'rovalraImage proxy failed',
                        ),
                    );
                    return;
                }
                resolve(response.dataUri);
            },
        );
    });

    cache.set(url, promise);
    promise.catch(() => cache.delete(url));
    return promise;
}
