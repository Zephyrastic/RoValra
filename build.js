const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
let sass = null;
try {
    sass = require('sass');
} catch (e) {
    console.warn('Sass not found, skipping SCSS compilation.');
}

// Build target: `node build.js --firefox` emits a Firefox-flavoured build in
// dist-firefox/ (event-page background + gecko manifest keys). The default
// (no flag) keeps producing the Chromium build in dist/ exactly as before.
const target = process.argv.includes('--firefox') ? 'firefox' : 'chromium';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist';

const dracoPath = path.join(
    __dirname,
    'node_modules',
    'roavatar-renderer',
    'dist',
    'draco_decoder.js',
);
const backgroundEntryPath = path.join(
    __dirname,
    'src',
    'background',
    'background.js',
);
const interceptEntryPath = path.join(
    __dirname,
    'src',
    'content',
    'core',
    'xhr',
    'intercept.js',
);
const contentEntryPath = path.join(__dirname, 'src', 'content', 'index.js');

const manifestPath = path.join(__dirname, 'manifest.json');
const packagePath = path.join(__dirname, 'package.json');
let pkg;

try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    if (pkg.version !== manifest.version) {
        pkg.version = manifest.version;
        fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
        console.log(`Updated package.json version to ${manifest.version}`);
    }
} catch (e) {
    console.error(
        'Failed to sync version from manifest.json to package.json',
        e,
    );
    process.exit(1);
}
//E why the hell did i make this comment?
const bannerText = `/*!
 * ${pkg.name} v${pkg.version}
 * License: GPL-3.0
 * Repository: https://github.com/NotValra/RoValra
 * This extension is provided AS-IS without warranty.
 */`;

const commonConfig = {
    minify: false,

    minifyWhitespace: false,
    minifySyntax: true,
    minifyIdentifiers: false,

    keepNames: true,

    logLevel: 'info',

    legalComments: 'none',

    banner: {
        js: bannerText,
        css: bannerText,
    },
};

function compileScssFile(inputFile, outputFile) {
    if (!sass) return;
    try {
        const outputDir = path.dirname(outputFile);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const result = sass.compile(inputFile, { style: 'compressed' });
        fs.writeFileSync(outputFile, bannerText + '\n' + result.css);
        console.log(`Compiled SCSS: ${inputFile} -> ${outputFile}`);
    } catch (e) {
        console.error(`SCSS Compilation Failed for ${inputFile}:`, e.message);
    }
}

esbuild
    .build({
        ...commonConfig,
        entryPoints: [backgroundEntryPath],
        outfile: `${outDir}/background.js`,
        bundle: true,
    })
    .catch(() => process.exit(1));

esbuild
    .build({
        ...commonConfig,
        entryPoints: [interceptEntryPath],
        outfile: `${outDir}/intercept.js`,
        bundle: false,
    })
    .catch(() => process.exit(1));

const cssDir = path.join(__dirname, 'src', 'css');

if (sass && fs.existsSync(cssDir)) {
    const mainScss = path.join(cssDir, 'main.scss');
    if (fs.existsSync(mainScss)) {
        try {
            const result = sass.compile(mainScss, { style: 'compressed' });
            if (!fs.existsSync(`${outDir}/css`))
                fs.mkdirSync(`${outDir}/css`, { recursive: true });
            fs.writeFileSync(
                `${outDir}/css/rovalra.css`,
                bannerText + '\n' + result.css,
            );
            console.log(
                `Compiled SCSS: src/css/main.scss -> ${outDir}/css/rovalra.css`,
            );
        } catch (e) {
            console.error('SCSS Compilation Failed:', e.message);
        }
    }

    const sitewideScss = path.join(cssDir, 'sitewide.scss');
    if (fs.existsSync(sitewideScss)) {
        try {
            const result = sass.compile(sitewideScss, { style: 'expanded' });
            if (!fs.existsSync(`${outDir}/css`))
                fs.mkdirSync(`${outDir}/css`, { recursive: true });
            fs.writeFileSync(
                `${outDir}/css/sitewide.css`,
                bannerText + '\n' + result.css,
            );
            console.log(
                `Compiled SCSS: src/css/sitewide.scss -> ${outDir}/css/sitewide.css`,
            );
        } catch (e) {
            console.error('SCSS Compilation Failed:', e.message);
        }
    }

    const independentCssDir = path.join(cssDir, 'independent');
    if (fs.existsSync(independentCssDir)) {
        const walkSync = (dir, callback) => {
            fs.readdirSync(dir).forEach((file) => {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    walkSync(filePath, callback);
                } else if (file.endsWith('.scss')) {
                    callback(filePath);
                }
            });
        };

        walkSync(independentCssDir, (filePath) => {
            const relativePath = path.relative(independentCssDir, filePath);
            const outputName = relativePath
                .replace(/\\|\//g, '-')
                .replace('.scss', '.css');
            compileScssFile(filePath, path.join(outDir, 'css', outputName));
        });
    }
}

if (!fs.existsSync(dracoPath)) {
    console.error(`Error: draco_decoder.js not found at ${dracoPath}`);
    process.exit(1);
}
const dracoSource = fs.readFileSync(dracoPath, 'utf8');

esbuild
    .build({
        ...commonConfig,
        entryPoints: [contentEntryPath],
        outfile: `${outDir}/content.js`,
        bundle: true,
        // This injects Draco directly into the content script context for roavatar-renderer
        banner: {
            js: bannerText + '\n' + dracoSource,
        },
    })
    .catch(() => process.exit(1));
if (fs.existsSync(cssDir)) {
    const cssFiles = fs
        .readdirSync(cssDir)
        .filter((file) => file.endsWith('.css'))
        .map((file) => path.join(cssDir, file));

    if (cssFiles.length > 0) {
        esbuild
            .build({
                ...commonConfig,
                entryPoints: cssFiles,
                outdir: `${outDir}/css`,
            })
            .catch(() => process.exit(1));
    }
}

function processDirectory(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            processDirectory(srcPath, destPath);
        } else {
            const ext = path.extname(entry.name).toLowerCase();

            if (ext === '.js' || ext === '.css' || ext === '.ts') {
                try {
                    const content = fs.readFileSync(srcPath, 'utf8');

                    const result = esbuild.transformSync(content, {
                        loader: ext.slice(1),
                        minifyWhitespace: false,
                        minifySyntax: true,
                        minifyIdentifiers: false,
                        keepNames: true,
                        legalComments: 'none',
                        banner: bannerText,
                    });

                    fs.writeFileSync(destPath, result.code);
                    console.log(
                        `Copied, Compressed & Bannered: ${entry.name}`,
                    );
                } catch (err) {
                    console.error(
                        `Error processing ${entry.name}, copying raw instead.`,
                        err,
                    );
                    fs.copyFileSync(srcPath, destPath);
                }
            } else if (ext === '.yaml') {
                try {
                    const data = yaml.parse(fs.readFileSync(srcPath, 'utf8'));
                    fs.writeFileSync(
                        destPath.slice(0, destPath.length - 4) + 'json',
                        JSON.stringify(data, undefined, ' '),
                    );
                } catch (err) {
                    console.error(
                        `Error processing ${entry.name}, copying raw instead.`,
                        err,
                    );
                    throw err;
                }
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

if (fs.existsSync('public')) {
    processDirectory('public', path.join(outDir, 'public'));
}
if (fs.existsSync('assets')) {
    processDirectory('assets', path.join(outDir, 'assets'));
}
if (fs.existsSync('_locales')) {
    processDirectory('_locales', path.join(outDir, '_locales'));
}

// Applies the Firefox-specific manifest differences on top of the Chromium
// manifest (which stays untouched as the source of truth).
function buildFirefoxManifest(manifestJson) {
    // Firefox has no background.service_worker support (bug 1573659); MV3
    // backgrounds run as an event page declared with background.scripts.
    if (manifestJson.background) {
        delete manifestJson.background.service_worker;
        manifestJson.background.scripts = ['background.js'];
    }
    // content_scripts.world: "MAIN" needs Firefox 128+; gecko.id is required
    // to sign/load MV3 add-ons in Firefox and data_collection_permissions is
    // required for add-ons submitted to addons.mozilla.org (tolerated since
    // Firefox 128, older versions would reject the manifest).
    manifestJson.browser_specific_settings = {
        gecko: {
            id: '{e7c2b9a4-5f13-4d6a-8b0e-3a9c7f2d61b4}',
            strict_min_version: '128.0',
            data_collection_permissions: {
                required: ['none'],
            },
        },
    };
    // Firefox does not allow "contextMenus" in optional_permissions (it can
    // only be a required permission there), so grant it up-front instead of
    // relying on chrome.permissions.request().
    if (Array.isArray(manifestJson.optional_permissions)) {
        const optional = manifestJson.optional_permissions;
        if (optional.includes('contextMenus')) {
            manifestJson.optional_permissions = optional.filter(
                (permission) => permission !== 'contextMenus',
            );
            if (!manifestJson.permissions.includes('contextMenus')) {
                manifestJson.permissions = [
                    ...manifestJson.permissions,
                    'contextMenus',
                ];
            }
            if (manifestJson.optional_permissions.length === 0) {
                delete manifestJson.optional_permissions;
            }
        }
    }
    return manifestJson;
}

if (fs.existsSync('manifest.json')) {
    try {
        const manifestContent = fs.readFileSync('manifest.json', 'utf8');
        let manifestJson = JSON.parse(manifestContent);
        if (target === 'firefox') {
            manifestJson = buildFirefoxManifest(manifestJson);
        }
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
            path.join(outDir, 'manifest.json'),
            JSON.stringify(manifestJson),
        );
    } catch (e) {
        console.log(e);
        fs.copyFileSync('manifest.json', path.join(outDir, 'manifest.json'));
    }
}
