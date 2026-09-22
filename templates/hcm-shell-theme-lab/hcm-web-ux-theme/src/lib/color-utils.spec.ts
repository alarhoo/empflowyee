import { describe, expect, it } from 'vitest'
import { deriveAccentPalette, normalizeHexColor } from './color-utils'

describe('color utils', /** Group color normalization and derivation examples. */ () => {
	it('normalizes three-digit hex', /** Verify shorthand hex expands into six digits. */ () =>
		expect(normalizeHexColor('#b43')).toBe('#bb4433'))
	it('rejects non-hex input', /** Reject arbitrary CSS values. */ () =>
		expect(normalizeHexColor('red; background:url(x)')).toBeNull())
	it('derives a readable accent palette', /** Verify the primary survives palette derivation and a foreground is selected. */ () => {
		const palette = deriveAccentPalette('#b74435', false)
		expect(palette.primary).toBe('#b74435')
		expect(['#000000', '#ffffff']).toContain(palette.onPrimary)
	})
})
