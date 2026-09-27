/**
 * Models and room textures are fetched as `path?v=<content hash>` (hashes
 * computed at build time, bundler/webpack.common.js). Those URLs are cached
 * for a year without revalidation (vercel.json), so a returning visitor
 * loads the room without asking the server about each file; a changed file
 * gets a new hash, and so a new URL.
 */
declare const __ASSET_VERSIONS__: Record<string, string> | undefined;

const versions: Record<string, string> =
    typeof __ASSET_VERSIONS__ === 'undefined' ? {} : __ASSET_VERSIONS__;

export default function assetUrl(path: string) {
    const version = versions[path.replace(/^\//, '')];
    return version ? `${path}?v=${version}` : path;
}
