import { vars } from 'nativewind';

// Raw color values - update these and they sync everywhere. They mirror the
// website tokens in apps/web/src/style.css so both clients look like one product.
export const colors = {
  light: {
    '--primary': '29 90 67',
    '--primary-foreground': '245 250 247',
    '--card': '255 255 255',
    '--secondary': '232 241 235',
    '--secondary-foreground': '22 62 50',
    '--background': '247 248 246',
    '--popover': '255 255 255',
    '--popover-foreground': '16 36 29',
    '--muted': '239 243 240',
    '--muted-foreground': '90 106 99',
    '--destructive': '200 30 30',
    '--success': '21 128 61',
    '--warning': '180 83 9',
    '--foreground': '16 36 29',
    '--border': '225 231 227',
    '--input': '214 223 217',
    '--ring': '59 133 102',
    '--accent': '232 241 235',
    '--accent-foreground': '22 62 50',
  },
};

// Config for nativewind vars() - used by provider
export const config = {
  light: vars(colors.light),
};

// Fixed product appearance, also used by native SVG elements.
export const themeColors = colors.light;

type StripPrefix<T> = T extends `--${infer Name}` ? Name : never;
export type ThemeColor = StripPrefix<keyof typeof themeColors>;

/** `rgba(...)` for props that cannot use class names, such as SVG strokes. */
export function themeColor(name: ThemeColor, opacity = 1) {
  return `rgba(${themeColors[`--${name}`].replaceAll(' ', ', ')}, ${opacity})`;
}
