import {
	PROFILE_EMAIL_MAX_LENGTH,
	PROFILE_PHONE_MAX_LENGTH,
	PROFILE_PHONE_MIN_DIGITS,
	PROFILE_PHONE_MAX_DIGITS,
	profileEmailIssue,
	profilePhoneIssue,
	type SelfContactPointType,
} from '@empflowyee/hcm-employee-contract'

export const PROFILE_PHONE_HELP = `Use ${PROFILE_PHONE_MIN_DIGITS}–${PROFILE_PHONE_MAX_DIGITS} digits, up to ${PROFILE_PHONE_MAX_LENGTH} characters including spaces, dashes or paired brackets. Put + only at the start; no extensions.`
export const PROFILE_EMAIL_HELP = `Use an email address such as name@example.com, up to ${PROFILE_EMAIL_MAX_LENGTH} characters.`

/** Translate shared contact constraints into field errors for the profile's Signal Forms. */
export function contactValidationError(
	type: SelfContactPointType,
	value: string,
	required = true,
): { kind: string; message: string } | null {
	const email = type === 'PersonalEmail'
	const issue = email ? profileEmailIssue(value) : profilePhoneIssue(value, required)
	if (!issue) return null
	if (issue === 'required')
		return { kind: issue, message: email ? 'Enter an email address.' : 'Enter a phone number.' }
	if (issue === 'too-long')
		return {
			kind: issue,
			message: `Use no more than ${email ? PROFILE_EMAIL_MAX_LENGTH : PROFILE_PHONE_MAX_LENGTH} characters.`,
		}
	return {
		kind: issue,
		message: email
			? 'Enter an email address such as name@example.com. Use a valid dotted domain and no spaces or consecutive dots.'
			: PROFILE_PHONE_HELP,
	}
}
