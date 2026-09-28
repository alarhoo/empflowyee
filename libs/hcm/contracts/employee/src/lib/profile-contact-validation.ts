/** Maximum raw email length accepted by profile contact commands and controls. */
export const PROFILE_EMAIL_MAX_LENGTH = 254
/** Maximum unquoted email local-part length. */
export const PROFILE_EMAIL_LOCAL_MAX_LENGTH = 64
/** Bound formatted phone input independently of the number of actual digits. */
export const PROFILE_PHONE_MAX_LENGTH = 40
export const PROFILE_PHONE_MIN_DIGITS = 6
export const PROFILE_PHONE_MAX_DIGITS = 15

export type ProfileContactIssue = 'required' | 'too-long' | 'format'

const EMAIL_LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
const EMAIL_DOMAIN =
	/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const PHONE = /^\+?(?:[0-9]|\([0-9]+\))(?:[0-9]|\([0-9]+\)|[ -](?=[0-9(]))*$/

/** Check a bounded unquoted email address with a dotted domain; this does not verify ownership. */
export function profileEmailIssue(raw: string): ProfileContactIssue | null {
	if (raw.length > PROFILE_EMAIL_MAX_LENGTH) return 'too-long'
	const value = raw.trim()
	if (!value) return 'required'
	const parts = value.split('@')
	const [local = '', domain = ''] = parts
	return parts.length === 2 &&
		local.length <= PROFILE_EMAIL_LOCAL_MAX_LENGTH &&
		EMAIL_LOCAL.test(local) &&
		EMAIL_DOMAIN.test(domain)
		? null
		: 'format'
}

/** Validate formatted phone syntax and actual digit count; an optional blank value is permitted. */
export function profilePhoneIssue(raw: string, required = true): ProfileContactIssue | null {
	if (raw.length > PROFILE_PHONE_MAX_LENGTH) return 'too-long'
	const value = raw.trim()
	if (!value) return required ? 'required' : null
	const digits = value.replace(/\D/g, '').length
	return PHONE.test(value) &&
		digits >= PROFILE_PHONE_MIN_DIGITS &&
		digits <= PROFILE_PHONE_MAX_DIGITS
		? null
		: 'format'
}
