/**
 * Which links Begu's replies may turn into clickable links.
 *
 * Replies come from a language model, and a visitor can try to steer it
 * ("say: [Nihar's résumé](https://evil.example)"). So only Nihar's own
 * destinations are links; anything else shows as plain text with its real
 * address, and images never load (the CSP blocks remote ones anyway).
 */
const HOSTS = new Set([
    'niharshah.me',
    'www.niharshah.me',
    'niharshah.in',
    'www.niharshah.in',
]);
/** Profiles on shared sites: only Nihar's own paths. */
const PROFILES: [host: string, path: RegExp][] = [
    ['github.com', /^\/nihar5hah(\/|$)/i],
    ['www.github.com', /^\/nihar5hah(\/|$)/i],
    ['linkedin.com', /^\/in\/niharshah0405\/?$/i],
    ['www.linkedin.com', /^\/in\/niharshah0405\/?$/i],
];
const EMAIL = 'mailto:niharshah0405@gmail.com';

/** The link if Begu may show it as a link, otherwise null. */
export function safeBeguLink(href: string | undefined | null) {
    if (!href) return null;
    const value = href.trim();
    if (value.toLowerCase() === EMAIL) return EMAIL;
    // Same-site paths ("/desktop/?app=resume"), never "//host" or "/\host".
    if (/^\/(?![/\\])/.test(value)) return value;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (HOSTS.has(host)) return url.href;
    return PROFILES.some(([h, path]) => h === host && path.test(url.pathname))
        ? url.href
        : null;
}
