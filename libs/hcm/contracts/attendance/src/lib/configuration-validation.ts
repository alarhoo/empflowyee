import { dateValue, invalidField } from '@empflowyee/hcm-runtime-contract'

/** Preserve submitted text; whitespace validation never silently changes a business value. */
export function configurationText(
	value: unknown,
	field: string,
	maximum: number,
	required = true,
): string {
	if (
		typeof value !== 'string' ||
		value.length > maximum ||
		(required && !value.trim()) ||
		/\p{Cc}/u.test(value.replace(/[\n\r\t]/g, ''))
	)
		invalidField(field)
	return value
}

/** Validate common configuration identity and inclusive effective dates without deriving missing dates. */
export function configurationIdentity(input: Record<string, unknown>): {
	code: string
	name: string
	effectiveFrom: string
	effectiveTo?: string
} {
	const code = configurationText(input['code'], 'code', 40)
	if (!/^[A-Z][A-Z0-9_-]*$/.test(code)) invalidField('code')
	const effectiveFrom = dateValue(input['effectiveFrom'], 'effectiveFrom')
	const result = { code, name: configurationText(input['name'], 'name', 120), effectiveFrom }
	if (input['effectiveTo'] === undefined) return result
	const effectiveTo = dateValue(input['effectiveTo'], 'effectiveTo')
	if (effectiveTo < effectiveFrom) invalidField('effectiveTo')
	return { ...result, effectiveTo }
}
