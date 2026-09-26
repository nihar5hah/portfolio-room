import React from 'react';

type AppModule<P> = { default: React.ComponentType<P> };

export interface LazyApp<P> {
    /** Rendered inside Suspense; replaced by retry() after a failed load. */
    Component: React.LazyExoticComponent<React.ComponentType<P>>;
    /** The app itself once its code has arrived: render it without suspending. */
    loaded?: React.ComponentType<P>;
    /** Starts the download early, e.g. while the pointer rests on a dock icon. */
    preload: () => Promise<AppModule<P>>;
    /** After a failed load (offline, or a redeploy removed the old chunk), try again. */
    retry: () => void;
}

/**
 * An app whose code is fetched the first time it opens, so the desktop starts
 * with only what the first window needs. One download is shared by preload()
 * and the lazy component; a failed download is forgotten so it can be retried.
 */
export default function lazyApp<P>(load: () => Promise<AppModule<P>>) {
    let pending: Promise<AppModule<P>> | undefined;
    const preload = () =>
        (pending ??= load().then(
            (module) => {
                app.loaded = module.default;
                return module;
            },
            (error) => {
                pending = undefined;
                throw error;
            },
        ));
    const app: LazyApp<P> = {
        Component: React.lazy(preload),
        preload,
        retry: () => {
            // React.lazy remembers a rejection forever, so a retry needs a fresh one.
            app.Component = React.lazy(preload);
        },
    };
    return app;
}
