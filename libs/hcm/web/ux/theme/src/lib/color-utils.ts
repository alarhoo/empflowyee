export interface DerivedAccentPalette {
	primary: string
	strong: string
	hover: string
	active: string
	onPrimary: '#000000' | '#ffffff'
}

/** Accept only three- or six-digit hexadecimal color data; reject CSS expressions. */
export function normalizeHexColor(value: string): string | null {
	const trimmed = value.trim().toLowerCase()
	const short = /^#([0-9a-f]{3})$/.exec(trimmed)
	if (short)
		return (
			'#' +
			short[1]
				.split('')
				.map(/** Expand each short color channel. */ (c) => c + c)
				.join('')
		)
	return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null
}

/** Derive readable branding states without changing the tenant's primary color.
 * Hover/active move away from the chosen foreground to preserve its contrast.
 * Strong text is adjusted against the current surface, independently of the primary.
 */
export function deriveAccentPalette(
	hex: string,
	darkTheme: boolean,
	surface?: string,
): DerivedAccentPalette {
	const primary = normalizeHexColor(hex)
	if (!primary) throw new Error('Invalid hexadecimal primary color')
	const onPrimary =
		contrastRatio(primary, '#000000') >= contrastRatio(primary, '#ffffff') ? '#000000' : '#ffffff'
	const stateTarget = onPrimary === '#ffffff' ? '#000000' : '#ffffff'
	const background = normalizeHexColor(surface ?? '') ?? (darkTheme ? '#1d232a' : '#ffffff')
	const strongTarget = darkTheme ? '#ffffff' : '#000000'
	let strong = mix(primary, strongTarget, darkTheme ? 0.28 : 0.16)
	for (let amount = 0.2; contrastRatio(strong, background) < 4.5 && amount <= 1; amount += 0.05) {
		strong = mix(primary, strongTarget, Math.min(amount, 1))
	}
	if (contrastRatio(strong, background) < 4.5) strong = strongTarget
	return {
		primary,
		strong,
		hover: mix(primary, stateTarget, 0.1),
		active: mix(primary, stateTarget, 0.2),
		onPrimary,
	}
}

/** Measure WCAG relative-luminance contrast for two validated hexadecimal colors. */
export function contrastRatio(first: string, second: string): number {
	const a = luminance(first)
	const b = luminance(second)
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Blend sRGB channel values for deterministic accent states. */
function mix(first: string, second: string, amount: number): string {
	const a = channels(first)
	const b = channels(second)
	return (
		'#' +
		a
			.map(
				/** Blend and encode one color channel. */ (channel, index) =>
					Math.round(channel + (b[index] - channel) * amount)
						.toString(16)
						.padStart(2, '0'),
			)
			.join('')
	)
}

/** Linearize sRGB channels before measuring perceptual luminance. */
function luminance(hex: string): number {
	return channels(hex)
		.map(
			/** Convert the encoded channel to linear light. */ (value) => {
				const c = value / 255
				return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
			},
		)
		.reduce(
			/** Apply WCAG luminance weights. */ (sum, value, index) =>
				sum + value * [0.2126, 0.7152, 0.0722][index],
			0,
		)
}

/** Decode a strict hexadecimal color, failing closed for unvalidated callers. */
function channels(hex: string): number[] {
	const value = normalizeHexColor(hex)
	if (!value) throw new Error('Invalid hexadecimal color')
	return [1, 3, 5].map(
		/** Decode one two-digit sRGB channel. */ (offset) =>
			Number.parseInt(value.slice(offset, offset + 2), 16),
	)
}
