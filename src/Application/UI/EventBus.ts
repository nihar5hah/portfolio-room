const UIEventBus = {
    on(event: string, callback: (...args: any[]) => any) {
        const handler = (e: Event) => callback((e as CustomEvent).detail);
        document.addEventListener(event, handler);
        return () => document.removeEventListener(event, handler);
    },
    dispatch(event: string, data: any) {
        document.dispatchEvent(new CustomEvent(event, { detail: data }));
    },
    remove(event: string, callback: EventListener) {
        document.removeEventListener(event, callback);
    },
};
export default UIEventBus;
