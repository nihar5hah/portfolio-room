declare interface StyleSheetCSS {
    [key: string]: React.CSSProperties;
}

declare interface WindowAppProps {
    onClose: () => void;
    onInteract: () => void;
    onMinimize: () => void;
    /** Set by Desktop: the frontmost visible window is the active one, as in macOS. */
    active?: boolean;
}

/** Open windows by app key; Desktop renders each app from its registry entry. */
declare type DesktopWindows = {
    [key in string]: {
        zIndex: number;
        minimized: boolean;
        name: string;
        icon: import('../assets/icons').IconName;
    };
};
