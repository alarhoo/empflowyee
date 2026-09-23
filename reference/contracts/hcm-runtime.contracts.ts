/**
 * REFERENCE ONLY.
 * Adapt names/imports to the actual workspace contract conventions.
 */

export type TenantLifecycleStatus =
  | 'trial'
  | 'active'
  | 'grace'
  | 'suspended'
  | 'deactivated';

export type HcmThemePreference =
  | 'horizon-light'
  | 'horizon-dark'
  | 'her-light'
  | 'her-dark';

export interface TenantBrandingContract {
  displayName: string;
  logoUrl?: string;
  primaryColor?: string;
  defaultTheme?: HcmThemePreference;
}

export interface LocalePreferenceContract {
  language?: string;
  locale?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: '12h' | '24h';
  numberFormat?: string;
  density?: 'cozy' | 'compact';
}

export interface TenantDiscoveryResponse {
  tenant: {
    slug: string;
    status: TenantLifecycleStatus;
    branding: TenantBrandingContract;
    defaults: LocalePreferenceContract;
  };
  authentication: {
    strategies: Array<'microsoft' | 'google' | 'empflowyee'>;
  };
}

export interface HcmRuntimeSessionResponse {
  tenant: {
    slug: string;
    status: TenantLifecycleStatus;
    branding: TenantBrandingContract;
    defaults: LocalePreferenceContract;
  };
  user: {
    id: string;
    employeeId?: string;
    displayName: string;
    avatarUrl?: string;
  };
  access: {
    roles: string[];
    permissions: string[];
    entitlements: string[];
    featureFlags: string[];
  };
  preferences: LocalePreferenceContract & {
    theme?: HcmThemePreference;
  };
  session: {
    version: string;
    expiresAt?: string;
  };
}
