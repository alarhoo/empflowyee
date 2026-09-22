import { describe, expect, it } from 'vitest'
import { parseHerTokenDocument, validateHerToken } from './her-token-contract'

describe('HER token import boundary', /** Keep the live editor restricted to semantic values and atomic documents. */ () => {
	it('normalizes colors and accepts bounded geometry', /** Preserve valid user data without accepting CSS programs. */ () => {
		expect(validateHerToken('--ef-text-strong', '#AbC')).toBe('#aabbcc')
		expect(validateHerToken('--ef-radius-control', '0.75rem')).toBe('0.75rem')
		expect(validateHerToken('--ef-shadow-control', 'none')).toBe('none')
	})
	it('rejects CSS injection, unknown tokens and excessive geometry', /** Fail closed for arbitrary selectors, URLs and unsafe values. */ () => {
		for (const [name, value] of [
			['--ef-text-strong', 'red;display:none'],
			['--ef-radius-control', '33px'],
			['--ef-shadow-control', 'url(https://example.test)'],
			['--sapTextColor', '#fff'],
			['__proto__', '#fff'],
		]) {
			expect(
				/** Exercise each untrusted token at the validation boundary. */ () =>
					validateHerToken(name, value),
			).toThrow()
		}
	})
	it('validates schema, family and tenant branding before returning any overrides', /** Reject mixed invalid documents rather than partially applying them. */ () => {
		const document = {
			schemaVersion: 1,
			base: 'her-dark',
			tenantPrimary: '#abc',
			tokens: { '--ef-text-strong': '#fff' },
		}
		expect(parseHerTokenDocument(JSON.stringify(document))).toEqual({
			...document,
			tenantPrimary: '#aabbcc',
			tokens: { '--ef-text-strong': '#ffffff' },
		})
		for (const change of [
			{ schemaVersion: 2 },
			{ base: 'horizon-light' },
			{ tenantPrimary: 'blue' },
			{ tokens: { '--ef-text-strong': '#fff', '--unknown': '#fff' } },
			{ tokens: [] },
			{ stylesheet: 'body{}' },
		]) {
			expect(
				/** Attempt an invalid document without side effects. */ () =>
					parseHerTokenDocument(JSON.stringify({ ...document, ...change })),
			).toThrow()
		}
	})
})
