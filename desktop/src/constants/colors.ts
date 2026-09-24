const colors = {
    white: '#f8fafb',
    black: '#263749',
    turquoise: '#53799b',
    lightGray: '#d6dde3',
    darkGray: '#8795a2',
    blue: '#294f89',
    darkBlue: '#234577',
    red: '#b64638',
} as const;
export type ColorName = keyof typeof colors;
export type ThemeColor = (typeof colors)[ColorName];
export default colors;
