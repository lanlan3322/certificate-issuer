export const COOKIE_CONSENT_KEY = "verifiable-cookie-consent";
export const COOKIE_CONSENT_CHANGED = "verifiable-cookie-consent-changed";
export const COOKIE_PREFERENCES_OPEN = "verifiable-cookie-preferences-open";

export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  marketing: false;
  consentDate: string;
  version: 1;
}

export function parseCookieConsent(value: string | null): CookieConsent | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    if (!("version" in parsed) || parsed.version !== 1 ||
        !("necessary" in parsed) || parsed.necessary !== true ||
        !("analytics" in parsed) || typeof parsed.analytics !== "boolean" ||
        !("marketing" in parsed) || parsed.marketing !== false ||
        !("consentDate" in parsed) || typeof parsed.consentDate !== "string" ||
        !Number.isFinite(Date.parse(parsed.consentDate))) return null;
    return {
      necessary: true, analytics: parsed.analytics, marketing: false,
      consentDate: parsed.consentDate, version: 1,
    };
  } catch {
    return null;
  }
}

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    return parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_KEY));
  } catch {
    // Unavailable storage is not permission to track.
    return null;
  }
}

export function saveCookieConsent(analytics: boolean): CookieConsent {
  const consent: CookieConsent = {
    necessary: true, analytics, marketing: false,
    consentDate: new Date().toISOString(), version: 1,
  };
  window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED));
  return consent;
}

export function hasAnalyticsConsent(): boolean {
  return readCookieConsent()?.analytics === true;
}

export function openCookiePreferences() {
  window.dispatchEvent(new Event(COOKIE_PREFERENCES_OPEN));
}
