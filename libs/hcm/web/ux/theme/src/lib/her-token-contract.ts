import { normalizeHexColor } from './color-utils'

export const HER_COLOR_GROUPS: Readonly<Record<string, readonly string[]>> = {
	'Accent / brand': [
		'color-accent',
		'color-accent-strong',
		'color-accent-hover',
		'color-accent-active',
		'color-on-accent',
	],
	Text: ['text-strong', 'text-muted', 'text-subtle'],
	Surfaces: [
		'surface-canvas',
		'surface-base',
		'surface-accent',
		'list-hover-surface',
		'list-active-surface',
	],
	'Borders / focus': ['border-subtle', 'focus-color'],
	'Semantic status': [
		'status-neutral-surface',
		'status-neutral-border',
		'status-neutral-text',
		'status-positive-surface',
		'status-positive-border',
		'status-positive-text',
		'status-critical-surface',
		'status-critical-border',
		'status-critical-text',
		'status-negative-surface',
		'status-negative-border',
		'status-negative-text',
		'status-information-surface',
		'status-information-border',
		'status-information-text',
	],
}
export const HER_RADIUS_TOKENS = ['--ef-radius-control', '--ef-radius-surface', '--ef-radius-hero']
export const HER_SHADOW_TOKENS = ['--ef-shadow-control', '--ef-shadow-surface', '--ef-shadow-hero']
export const HER_SHADOW_PRESETS = [
	'none',
	'0 1px 3px rgb(42 24 20 / 6%)',
	'0 3px 14px rgb(42 24 20 / 5%)',
	'0 8px 24px rgb(42 24 20 / 8%)',
]
export const HER_COLOR_TOKENS = Object.values(HER_COLOR_GROUPS)
	.flat()
	.map(/** Prefix the finite semantic palette names. */ (name) => '--ef-' + name)
export const HER_TOKEN_NAMES = [...HER_COLOR_TOKENS, ...HER_RADIUS_TOKENS, ...HER_SHADOW_TOKENS]

export interface HerTokenDocument {
	schemaVersion: 1
	base: 'her-light' | 'her-dark'
	tenantPrimary: string | null
	tokens: Record<string, string>
}

/** Accept only governed colors, bounded radii and named shadow values; never evaluate CSS input. */
export function validateHerToken(name: string, value: unknown): string {
	if (typeof value !== 'string') throw new Error('Token values must be text.')
	if (HER_COLOR_TOKENS.includes(name)) {
		const color = normalizeHexColor(value)
		if (color) return color
	} else if (HER_RADIUS_TOKENS.includes(name)) {
		const match = /^(\d+(?:\.\d+)?)(px|rem)$/.exec(value)
		if (match && Number(match[1]) <= (match[2] === 'rem' ? 2 : 32)) return value
	} else if (HER_SHADOW_TOKENS.includes(name) && HER_SHADOW_PRESETS.includes(value)) return value
	throw new Error(
		'Use an allowed token with a hex color, radius up to 32px / 2rem, or a shadow preset.',
	)
}

/** Validate the entire import before any theme state is mutated. */
export function parseHerTokenDocument(json: string): HerTokenDocument {
	if (json.length > 20000) throw new Error('Theme JSON exceeds 20 KB.')
	const value: unknown = JSON.parse(json)
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Expected a theme document.')
	const source = value as Record<string, unknown>
	if (
		Object.keys(source).some(
			/** Reject undeclared top-level fields. */ (key) =>
				!['schemaVersion', 'base', 'tenantPrimary', 'tokens'].includes(key),
		)
	)
		throw new Error('Unknown theme document field.')
	if (source['schemaVersion'] !== 1 || !['her-light', 'her-dark'].includes(String(source['base'])))
		throw new Error('Use schemaVersion 1 with an HER base.')
	const primary = source['tenantPrimary']
	if (primary !== null && (typeof primary !== 'string' || !normalizeHexColor(primary)))
		throw new Error('Invalid tenant primary color.')
	const tokens = source['tokens']
	if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens))
		throw new Error('Expected a token map.')
	const validated = Object.fromEntries(
		Object.entries(tokens).map(
			/** Validate every key/value before accepting the import. */ ([key, item]) => [
				key,
				validateHerToken(key, item),
			],
		),
	)
	return {
		schemaVersion: 1,
		base: source['base'] as HerTokenDocument['base'],
		tenantPrimary: primary === null ? null : normalizeHexColor(primary as string),
		tokens: validated,
	}
}
