import { inject } from '@angular/core'
import type { Routes } from '@angular/router'
import { RUNTIME_CONFIG } from '@empflowyee/platform-web-runtime-shell'
import { hcmRouteAccess, isThemeLabEnabled } from '@empflowyee/hcm-web-runtime-context'

export const appRoutes: Routes = [
	{
		path: 'audit/data-export-log',
		data: { catalogId: 'DATA_EXPORT_LOG' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Load the authorized export-evidence query screen. */ () =>
			import('@empflowyee/hcm-web-audit-feature-data-export-log').then(
				/** Select the owning domain feature. */ (m) => m.DataExportLogComponent,
			),
	},
	{
		path: 'audit/my-activity',
		data: { catalogId: 'MY_ACTIVITY' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Load the self-service audit screen only when requested. */ () =>
			import('@empflowyee/hcm-web-audit-feature-my-activity').then(
				/** Select the owning feature entry point. */ (m) => m.MyActivityComponent,
			),
	},
	{
		path: 'audit/audit-log',
		data: { catalogId: 'AUDIT_LOG' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Load the authorized audit query screen lazily. */ () =>
			import('@empflowyee/hcm-web-audit-feature-audit-log').then(
				/** Keep audit screen composition in its owning domain. */ (m) => m.AuditLogComponent,
			),
	},
	{
		path: 'identity-access/my-security',
		data: { catalogId: 'MY_SECURITY' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Load the self-only security screen on demand. */ () =>
			import('@empflowyee/hcm-web-identity-access-feature-my-security').then(
				/** Resolve the native page from its identity-owned feature. */ (m) =>
					m.MySecurityComponent,
			),
	},
	{
		path: 'identity-access/domain-configuration',
		data: { catalogId: 'DOMAIN_CONFIGURATION' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Load only the approved read-only domain screen. */ () =>
			import('@empflowyee/hcm-web-identity-access-feature-domain-configuration').then(
				/** Resolve the domain-owned native Page. */ (m) => m.DomainConfigurationComponent,
			),
	},
	{
		path: 'access-control/app-catalogue-configuration',
		data: { catalogId: 'APP_CATALOGUE_CONFIGURATION' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Lazy-load read-only canonical catalogue inspection. */ () =>
			import('@empflowyee/hcm-web-access-control-feature-app-catalogue-configuration').then(
				/** Resolve the domain-owned screen outside this bootstrap root. */ (module) =>
					module.CatalogueConfigurationComponent,
			),
	},
	{
		path: 'identity-access/identity-administration',
		data: { catalogId: 'IDENTITY_ADMINISTRATION' },
		canMatch: [hcmRouteAccess],
		loadChildren: /** Lazy-load the identity-owned account UI and draft guards. */ () =>
			import('@empflowyee/hcm-web-identity-access-feature-identity-administration').then(
				/** Keep app composition free of business components. */ (module) =>
					module.IDENTITY_ADMINISTRATION_ROUTES,
			),
	},
	{
		path: 'access-control/access-assignments',
		data: { catalogId: 'ACCESS_ASSIGNMENTS' },
		canMatch: [hcmRouteAccess],
		loadChildren: /** Lazy-load the assignment-owned list/detail and action guards. */ () =>
			import('@empflowyee/hcm-web-access-control-feature-access-assignments').then(
				/** Keep feature routing outside the thin bootstrap root. */ (module) =>
					module.ACCESS_ASSIGNMENTS_ROUTES,
			),
	},

	{
		path: 'access-control/role-management',
		data: { catalogId: 'ROLE_MANAGEMENT' },
		canMatch: [hcmRouteAccess],
		loadChildren: /** Load the domain-owned role routes and draft guards. */ () =>
			import('@empflowyee/hcm-web-access-control-feature-role-management').then(
				/** Keep role detail and complex edit routing inside the feature. */ (module) =>
					module.ROLE_MANAGEMENT_ROUTES,
			),
	},
	{
		path: 'ux/theme-lab',
		canMatch: [
			/** Gate lazy loading with public configuration; this is not authorization. */ () =>
				isThemeLabEnabled(inject(RUNTIME_CONFIG)),
		],
		loadChildren: /** Load the workspace outside the business shell. */ () =>
			import('@empflowyee/hcm-web-ux-feature-theme-lab').then(
				/** Select lazy routes. */ (m) => m.THEME_LAB_ROUTES,
			),
	},
	{
		path: 'workspace',
		data: { catalogId: 'runtime-workspace' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Load the guarded placeholder feature. */ () =>
			import('@empflowyee/hcm-web-runtime-feature-placeholder').then(
				/** Select the isolated feature component. */ (m) => m.HcmWebRuntimeFeaturePlaceholder,
			),
	},
	{ path: 'access-denied', children: [] },
	{
		path: '',
		pathMatch: 'full',
		data: { fullBleed: true },
		loadComponent: /** Load the catalogue screen independently of global shell chrome. */ () =>
			import('@empflowyee/hcm-web-navigation-feature-launchpad').then(
				/** Select the navigation-owned launchpad. */ (m) => m.HcmLaunchpadComponent,
			),
	},
	{ path: '**', redirectTo: '' },
]
