import { expect, it } from 'vitest'
import { validateAccessAudit, type Hcm2AuditEvent } from './hcm-api-audit-application'

/** Build safe owner audit metadata with no field values, policy payload or plaintext reason. */
function event(): Hcm2AuditEvent {
	return {
		action: 'attendance.configuration-created',
		category: 'business',
		targetType: 'attendance-schedule-version',
		targetId: 'version-one',
		requestId: 'command-one',
		summary: {
			reason: null,
			changedFields: ['days', 'timezoneMode'],
			fromState: null,
			toState: 'Draft',
		},
	}
}

it('admits only the explicit Attendance configuration actions and safe envelope', /** An Attendance prefix alone cannot register a new action or external handoff. */ () => {
	expect(
		/** The configured action is safe for shared audit queries. */ () =>
			validateAccessAudit(event()),
	).not.toThrow()
	for (const action of [
		'attendance.payroll-paid',
		'attendance.script-executed',
		'attendance.configuration-created.extra',
	])
		expect(
			/** Unknown actions are rejected before audit persistence. */ () =>
				validateAccessAudit({ ...event(), action }),
		).toThrow()
})

it('rejects plaintext reasons, arbitrary summaries and capture diagnostics', /** Source-encrypted command evidence must not leak into shared audit metadata. */ () => {
	const original = event()
	for (const summary of [
		{ ...original.summary, reason: 'Private narrative' },
		{ ...original.summary, latitude: 1 },
		{ ...original.summary, changedFields: ['submitted value=123'] },
	])
		expect(
			/** Every summary field must be a safe declared metadata value. */ () =>
				validateAccessAudit({ ...original, summary }),
		).toThrow()
	expect(
		/** Configuration changes cannot masquerade as a sensitive-data reveal. */ () =>
			validateAccessAudit({ ...original, category: 'sensitive-access' }),
	).toThrow()
})
