import { expect, it } from 'vitest'
import { profileEmailIssue, profilePhoneIssue } from './profile-contact-validation'
import { contactValue, parseRelationship } from './my-profile'

it.each([
	'jim@example.com',
	'jim.halpert+work@example.co.in',
	"o'brien@example.com",
	' jim@example.com ',
])(
	'accepts a supported email: %s',
	/** Ordinary mailboxes and plus addressing remain usable after trimming. */ (value) => {
		expect(profileEmailIssue(value)).toBeNull()
		expect(contactValue('PersonalEmail', value)).toBe(value.trim())
	},
)

it.each([
	'',
	'  ',
	'jim',
	'jim@localhost',
	'jim@@example.com',
	'.jim@example.com',
	'jim..halpert@example.com',
	'jim.@example.com',
	'jim@-example.com',
	'jim@example-.com',
	'jim@example..com',
	'jim@exam_ple.com',
	'jim halpert@example.com',
	'jim@example.com\nother@example.com',
	'a'.repeat(65) + '@example.com',
	'jim@' + 'a'.repeat(64) + '.com',
])(
	'rejects an invalid email: %s',
	/** The reusable rule and authoritative contact parser must reject the same malformed value. */ (
		value,
	) => {
		expect(profileEmailIssue(value)).not.toBeNull()
		expect(
			/** Exercise the public command validator. */ () => contactValue('PersonalEmail', value),
		).toThrow()
	},
)

it('enforces exact email length boundaries', /** Accept the supported maximum and reject one extra character before any request. */ () => {
	const email = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61)
	expect(email).toHaveLength(254)
	expect(profileEmailIssue(email)).toBeNull()
	expect(profileEmailIssue(email + 'd')).toBe('too-long')
	expect(
		/** The API must enforce the raw bound too. */ () => contactValue('PersonalEmail', email + 'd'),
	).toThrow()
})

it.each([
	'123456',
	'+123456789012345',
	'+1 (570) 555-0100',
	'(080) 1234 5678',
	'+91 98765 43210',
	' +44 20 7946 0958 ',
])(
	'accepts a supported phone: %s',
	/** Phone formatting may vary without changing the digit-count policy. */ (value) => {
		expect(profilePhoneIssue(value)).toBeNull()
		expect(contactValue('MobilePhone', value)).toBe(value.trim())
	},
)

it.each([
	'',
	'  ',
	'12345',
	'1234567890123456',
	'1    2',
	'1----2',
	'+1 570 CALL NOW',
	'++123456',
	'123+456',
	'+1 (570 555-0100',
	'+1 () 5705550100',
	'+1 ((570)) 5550100',
	'+1 570 5550100 ext 12',
	'123\n456',
])(
	'rejects an invalid phone: %s',
	/** Formatting characters cannot satisfy digit bounds or hide malformed numbers. */ (value) => {
		expect(profilePhoneIssue(value)).not.toBeNull()
		expect(
			/** Bypassing the browser does not bypass validation. */ () =>
				contactValue('MobilePhone', value),
		).toThrow()
	},
)

it('bounds formatted input and respects optional relationship numbers', /** Optional blanks clear a number, while emergency contacts still require a valid one. */ () => {
	const formatted = '+' + '(1) '.repeat(9) + '(2)'
	expect(formatted).toHaveLength(40)
	expect(profilePhoneIssue(formatted)).toBeNull()
	expect(profilePhoneIssue(formatted + ' ')).toBe('too-long')
	expect(profilePhoneIssue(' ', false)).toBeNull()
	const family = {
		relationshipType: 'SPOUSE',
		fullName: 'Pam',
		dependent: false,
		emergencyContact: false,
		contactNumber: ' ',
	}
	expect(parseRelationship(family, false).contactNumber).toBe('')
	expect(
		/** Emergency requiredness must be enforced on the server. */ () =>
			parseRelationship({ ...family, emergencyContact: true, emergencyPriority: 1 }, false),
	).toThrow()
	expect(
		/** Optional does not mean malformed values are accepted. */ () =>
			parseRelationship({ ...family, contactNumber: '1    2' }, false),
	).toThrow()
})
