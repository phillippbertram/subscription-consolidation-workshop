import { vars } from 'nativewind';

// Raw color values - update these and they sync everywhere
export const colors = {
  light: {
    '--primary': '51 98 92',
    '--primary-foreground': '250 250 250',
    '--card': '255 255 255',
    '--secondary': '245 245 245',
    '--secondary-foreground': '23 23 23',
    '--background': '243 246 248',
    '--popover': '255 255 255',
    '--popover-foreground': '10 10 10',
    '--muted': '245 245 245',
    '--muted-foreground': '69 92 96',
    '--destructive': '156 48 39',
    '--foreground': '20 47 44',
    '--border': '229 229 229',
    '--input': '229 229 229',
    '--ring': '212 212 212',
    '--accent': '247 247 247',
    '--accent-foreground': '52 52 52',
  },
  dark: {
    '--primary': '165 213 195',
    '--primary-foreground': '20 45 36',
    '--card': '27 37 34',
    '--secondary': '37 63 52',
    '--secondary-foreground': '238 245 242',
    '--background': '17 24 22',
    '--popover': '27 37 34',
    '--popover-foreground': '238 245 242',
    '--muted': '37 63 52',
    '--muted-foreground': '171 192 184',
    '--destructive': '255 145 137',
    '--foreground': '238 245 242',
    '--border': '53 70 63',
    '--input': '53 70 63',
    '--accent': '37 63 52',
    '--accent-foreground': '238 245 242',
    '--ring': '165 213 195',
  },
};

// Config for nativewind vars() - used by provider
export const config = {
  light: vars(colors.light),
  dark: vars(colors.dark),
};

// Fixed product appearance, also used by native SVG elements.
export const themeColors = colors.dark;
