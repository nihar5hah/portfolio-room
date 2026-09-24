import assert from 'node:assert/strict';

// Run in the in-app browser on a fresh desktop or focused Mac.
// await checkResumeWindow(tab, true) for the room; omit true for /desktop/.
export async function checkResumeWindow(tab, inLaptop = false) {
    const desktop = inLaptop
        ? tab.playwright.frameLocator('#computer-screen')
        : tab.playwright;
    const launcher = desktop
        .getByRole('contentinfo', { name: 'Applications' })
        .getByRole('button', { name: 'Résumé', exact: true });
    const sidebar = desktop
        .getByRole('navigation', { name: 'Portfolio' })
        .getByRole('button', { name: 'Résumé', exact: true });
    const viewer = desktop.getByRole('region', {
        name: 'Résumé — Nihar Shah',
        exact: true,
    });
    assert.equal(await launcher.count(), 1, 'one dock entry');
    assert.equal(await sidebar.count(), 1, 'one sidebar entry');
    assert.equal(
        await desktop.locator('a[href="/resume.pdf"]').count(),
        0,
        'no scattered downloads',
    );
    const activePage = await desktop
        .locator('.nav-links a.active')
        .getAttribute('href');
    await sidebar.click();
    assert.equal(
        await desktop.locator('.nav-links a.active').getAttribute('href'),
        activePage,
        'launching the résumé preserves the portfolio page',
    );
    const download = viewer.getByRole('link', {
        name: 'Download PDF',
        exact: true,
    });
    assert.equal(
        await download.getAttribute('download'),
        'Nihar-Shah-Resume.pdf',
    );
    assert.equal(await desktop.locator('a[href="/resume.pdf"]').count(), 1);
    const document = desktop.frameLocator('.resume-document');
    assert.equal(await document.locator('h1').innerText(), 'Nihar Shah');
    assert.equal(
        (await document.locator('h2').allTextContents()).join(','),
        'Summary,Education,Experience,Projects,Technical Skills',
    );
    const bounds = await document.locator('body').evaluate((body) => ({
        width: body.clientWidth,
        scrollWidth: body.scrollWidth,
    }));
    assert.equal(
        bounds.width,
        bounds.scrollWidth,
        'résumé text reflows without horizontal overflow',
    );
    await launcher.click();
    assert.equal(
        await viewer.count(),
        1,
        'reopening focuses the existing window',
    );
    await viewer
        .getByRole('button', { name: 'Minimize window', exact: true })
        .click();
    assert.equal(await viewer.isVisible(), false);
    await sidebar.click();
    assert.equal(
        await viewer.isVisible(),
        true,
        'sidebar restores the minimized résumé',
    );
    await viewer
        .getByRole('button', { name: 'Close window', exact: true })
        .click();
    assert.equal(await viewer.count(), 0);
    await launcher.click();
    assert.equal(await viewer.isVisible(), true, 'closed résumé reopens');
    return { entryPoints: 2, downloads: 1, sections: 5, ...bounds };
}

// Run at /?debug with the Mac focused; Escape belongs to the open menu first.
// Pass a native Escape action from the browser locator API as pressEscape.
export async function checkWorkspaceMenuEscape(cdp, pressEscape) {
    await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const button = document.querySelector('iframe').contentDocument.querySelector('.system-brand');
            button.focus(); button.click();
        })()`,
    });
    await pressEscape();
    const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const doc = document.querySelector('iframe').contentDocument;
            const button = doc.querySelector('.system-brand');
            return { camera: window.__app.camera.currentKeyframe,
                open: button.getAttribute('aria-expanded'),
                focused: doc.activeElement === button,
                name: button.getAttribute('aria-label') };
        })()`,
        returnByValue: true,
    });
    for (const [key, value] of Object.entries({
        camera: 'monitor',
        open: 'false',
        focused: true,
        name: 'Workspace menu',
    }))
        assert.equal(result.value[key], value, key);
    return result.value;
}

// Run on /desktop/ at a viewport wider than 700px with the portfolio open.
export async function checkCompactWindow(cdp) {
    const read = async (expression) =>
        (
            await cdp.send('Runtime.evaluate', {
                expression,
                returnByValue: true,
            })
        ).result.value;
    const point = await read(`(() => {
        const w = document.querySelector('.os-window');
        const r = w.querySelector('.window-resize-handle').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2,
            endX: w.offsetLeft + 400, endY: w.offsetTop + 500 };
    })()`);
    for (const [type, x, y, buttons, button] of [
        ['mouseMoved', point.x, point.y, 0, 'none'],
        ['mousePressed', point.x, point.y, 1, 'left'],
        ['mouseMoved', point.endX, point.endY, 1, 'none'],
        ['mouseReleased', point.endX, point.endY, 0, 'left'],
    ])
        await cdp.send('Input.dispatchMouseEvent', {
            type,
            x,
            y,
            buttons,
            button,
            clickCount: type === 'mouseMoved' ? 0 : 1,
        });
    const result = await read(`(() => {
        const p = document.querySelector('.portfolio-page');
        return { width: document.querySelector('.os-window').clientWidth,
            layout: getComputedStyle(document.querySelector('.portfolio-shell')).flexDirection,
            pageWidth: p.clientWidth, scrollWidth: p.scrollWidth };
    })()`);
    assert.equal(result.width, 520, 'dragging below minimum clamps the window');
    assert.equal(
        result.layout,
        'column',
        'compact layout follows window width',
    );
    assert.equal(
        result.scrollWidth,
        result.pageWidth,
        'content has no horizontal overflow',
    );
    return result;
}

// Run after narrowing to 390px, then widening past the mobile breakpoint.
export async function checkWindowAfterResize(cdp) {
    const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const rect = document.querySelector('.os-window').getBoundingClientRect();
            return { viewport: innerWidth, left: rect.left, right: rect.right, width: rect.width };
        })()`,
        returnByValue: true,
    });
    const bounds = result.result.value;
    assert.ok(
        bounds.width >= Math.min(520, bounds.viewport - 24),
        'window stays readable after crossing the mobile breakpoint',
    );
    assert.ok(
        bounds.left >= 0 && bounds.right <= bounds.viewport,
        'window stays inside the viewport',
    );
    return bounds;
}

// Run through the in-app browser's CDP capability at /?debug with Music open in the Mac.
// Example: await checkWindowRelease(await tab.capabilities.get('cdp'), 'drag');
export async function checkWindowRelease(cdp, gesture) {
    const read = async (expression) => {
        const result = await cdp.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.exceptionDetails)
            throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const settled = await read(`new Promise(resolve => {
        const deadline = performance.now() + 3000;
        function check() {
            const key = window.__app.camera.currentKeyframe;
            if (key === 'monitor' || performance.now() > deadline) resolve(key);
            else requestAnimationFrame(check);
        }
        check();
    })`);
    assert.equal(
        settled,
        'monitor',
        'focus the Mac before replaying a window gesture',
    );
    const selector = `.window-${gesture === 'drag' ? 'drag' : 'resize'}-handle`;
    const point = await read(`(() => {
        const frame = document.querySelector('#computer-screen');
        const window = frame.contentDocument.querySelector('.os-window[aria-label="Music"]');
        const f = frame.getBoundingClientRect(), h = window.querySelector('${selector}').getBoundingClientRect();
        return { x: f.left + (h.x + h.width / 2) * f.width / frame.clientWidth,
            y: f.top + (h.y + h.height / 2) * f.height / frame.clientHeight,
            outX: innerWidth - 30, outY: innerHeight / 2 };
    })()`);
    const style = () =>
        read(`(() => {
        const s = document.querySelector('#computer-screen').contentDocument.querySelector('.os-window[aria-label="Music"]').style;
        return { left: s.left, top: s.top, width: s.width, height: s.height };
    })()`);
    const before = await style();
    const mouse = (type, x, y, buttons, button = 'none') =>
        cdp.send('Input.dispatchMouseEvent', {
            type,
            x,
            y,
            buttons,
            button,
            clickCount: type === 'mouseMoved' ? 0 : 1,
        });
    await mouse('mouseMoved', point.x, point.y, 0);
    await mouse('mousePressed', point.x, point.y, 1, 'left');
    await mouse('mouseMoved', point.x + 45, point.y + 25, 1);
    await mouse('mouseMoved', point.outX, point.outY, 1);
    await mouse('mouseReleased', point.outX, point.outY, 0, 'left');
    const released = await style();
    assert.notDeepEqual(
        released,
        before,
        `${gesture} must actually move the window before testing release`,
    );
    const reentry = await read(`(() => {
        const f = document.querySelector('#computer-screen').getBoundingClientRect();
        return { x: f.left + f.width * .3, y: f.top + f.height * .4 };
    })()`);
    await mouse('mouseMoved', reentry.x, reentry.y, 0);
    await mouse('mouseMoved', reentry.x + 20, reentry.y + 20, 0);
    const returned = await style();
    assert.deepEqual(
        returned,
        released,
        `${gesture} must stop after release outside the iframe`,
    );
    return { gesture, before, released, returned };
}
