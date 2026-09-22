import { describe, expect, it } from 'vitest'
import { contrastRatio, deriveAccentPalette, normalizeHexColor } from './color-utils'

describe('tenant accent colors', /** Verify strict parsing and readable derived states across both modes. */ () => {
	it('normalizes only three- and six-digit hex data', /** Accept whitespace and case, rejecting arbitrary CSS and unsupported alpha values. */ () => {
		expect(normalizeHexColor(' #AbC ')).toBe('#aabbcc')
		expect(normalizeHexColor('#ABCDEF')).toBe('#abcdef')
		for (const input of [
			'red',
			'#abcd',
			'#12345678',
			'123456',
			'var(--x)',
			'#123; color:red',
			'url(x)',
			'',
			'#12xy34',
		]) {
			expect(normalizeHexColor(input)).toBeNull()
		}
		expect(
			/** Reject invalid input even when the palette helper is called directly. */ () =>
				deriveAccentPalette('red', false),
		).toThrow()
	})
	it('measures known contrast extremes', /** Check the luminance implementation independently of the palette algorithm. */ () => {
		expect(contrastRatio('#000000', '#ffffff')).toBe(21)
		expect(contrastRatio('#777777', '#777777')).toBe(1)
	})
	it('preserves readable text for a grid of light, dark and saturated accents', /** Verify normal, hover and active foregrounds plus strong surface text exceed 4.5:1. */ () => {
		for (const dark of [false, true]) {
			const surface = dark ? '#302626' : '#fff9f2'
			for (const r of ['00', '66', '99', 'ff'])
				for (const g of ['00', '66', '99', 'ff'])
					for (const b of ['00', '66', '99', 'ff']) {
						const hex = '#' + r + g + b
						const palette = deriveAccentPalette(hex, dark, surface)
						expect(palette.primary).toBe(hex)
						for (const background of [palette.primary, palette.hover, palette.active]) {
							expect(contrastRatio(background, palette.onPrimary)).toBeGreaterThanOrEqual(4.5)
						}
						expect(contrastRatio(palette.strong, surface)).toBeGreaterThanOrEqual(4.5)
					}
		}
	})
})
