// Checked in order: an Edge user agent also names Chrome and Safari, an
// iPhone's also names Mac OS X, and Android's also names Linux.
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone|\biPad|\biPod/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

/** The browser and operating system a user agent names, each null when unknown. */
export function describeUserAgent(userAgent: string | null): { browser: string | null; system: string | null } {
  const find = (patterns: Array<[RegExp, string]>) =>
    userAgent ? (patterns.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null) : null;
  return { browser: find(BROWSERS), system: find(SYSTEMS) };
}
