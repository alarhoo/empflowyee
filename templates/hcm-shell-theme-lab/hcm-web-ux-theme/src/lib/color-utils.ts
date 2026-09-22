export interface DerivedAccentPalette {
	primary: string
	strong: string
	hover: string
	active: string
	onPrimary: '#000000' | '#ffffff'
}

/** Accept a three- or six-digit hex value and normalize its representation. */ export function normalizeHexColor(
	value: string,
): string | null {
	const trimmed = value.trim().toLowerCase()
	const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
	if (short) {
		return `#${short[1]
			.split('')
			.map(/** Expand one shorthand channel into two digits. */ (c) => c + c)
			.join('')}`
	}
	const full = /^#([0-9a-f]{6})$/i.exec(trimmed)
	return full ? `#${full[1]}` : null
}

/** Derive example accent states from a validated primary color. */ export function deriveAccentPalette(
	hex: string,
	darkTheme: boolean,
): DerivedAccentPalette {
	const primary = normalizeHexColor(hex)
	if (!primary) throw new Error(`Invalid hex color: ${hex}`)

	return {
		primary,
		strong: mix(primary, darkTheme ? '#ffffff' : '#000000', darkTheme ? 0.28 : 0.16),
		hover: mix(primary, darkTheme ? '#ffffff' : '#000000', darkTheme ? 0.1 : 0.1),
		active: mix(primary, darkTheme ? '#ffffff' : '#000000', darkTheme ? 0.04 : 0.2),
		onPrimary: contrastColor(primary),
	}
}

/** Interpolate color channels with a clamped mixing amount. */ function mix(
	a: string,
	b: string,
	amount: number,
): string {
	const ca = toRgb(a)
	const cb = toRgb(b)
	const t = clamp(amount, 0, 1)
	return toHex({
		r: Math.round(ca.r + (cb.r - ca.r) * t),
		g: Math.round(ca.g + (cb.g - ca.g) * t),
		b: Math.round(ca.b + (cb.b - ca.b) * t),
	})
}

/** Choose a foreground using the template's luminance threshold. */ function contrastColor(
	hex: string,
): '#000000' | '#ffffff' {
	const rgb = toRgb(hex)
	const luminance = [rgb.r, rgb.g, rgb.b]
		.map(
			/** Linearize one sRGB channel. */ (v) => {
				const c = v / 255
				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
			},
		)
		.reduce(
			/** Accumulate weighted relative luminance. */ (sum, value, index) =>
				sum + value * [0.2126, 0.7152, 0.0722][index],
			0,
		)
	return luminance > 0.42 ? '#000000' : '#ffffff'
}

/** Decode validated hexadecimal channels into RGB values. */ function toRgb(hex: string): {
	r: number
	g: number
	b: number
} {
	const normalized = normalizeHexColor(hex)
	if (!normalized) throw new Error(`Invalid hex color: ${hex}`)
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16),
	}
}

/** Encode RGB channels into six-digit hexadecimal notation. */ function toHex(rgb: {
	r: number
	g: number
	b: number
}): string {
	return `#${[rgb.r, rgb.g, rgb.b].map(/** Clamp and encode a single RGB channel. */ (v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('')}`
}

/** Restrict a numeric value to the inclusive allowed range. */ function clamp(
	value: number,
	min: number,
	max: number,
): number {
	return Math.min(max, Math.max(min, value))
}
