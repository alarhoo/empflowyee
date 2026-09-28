import {
	boolValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	readBody,
} from '@empflowyee/hcm-runtime-contract'
import { configurationIdentity, configurationText } from './configuration-validation'
import type { AttendanceConfigurationState } from './hcm-attendance-contract'

export type AttendanceApprovalSubject =
	| 'Correction'
	| 'Adjustment'
	| 'Overtime'
	| 'Roster'
	| 'Override'
	| 'AnomalyWaiver'
	| 'PeriodReopen'
export type AttendanceCandidateRule =
	| { source: 'LineManager' }
	| { source: 'ManagerLevel'; managerLevel: number }
	| { source: 'Function'; functionCode: string }
	| { source: 'NamedUser'; accountId: string }
export interface AttendanceApprovalRule {
	subjectType: AttendanceApprovalSubject
	stage: number
	independent: boolean
	candidateRule: AttendanceCandidateRule
}
export interface EnabledOvertimeConfiguration {
	enabled: true
	qualification: 'ScheduledExcess' | 'RestDay' | 'Holiday'
	capMinutes: number
	preapprovalRequired: boolean
}
export type OvertimeConfiguration = { enabled: false } | EnabledOvertimeConfiguration
export interface AttendancePolicyDraft {
	code: string
	name: string
	effectiveFrom: string
	effectiveTo?: string
	graceInMinutes: number
	graceOutMinutes: number
	rounding: 'None' | 'Configured'
	roundingIncrementMinutes?: number
	roundingDirection?: 'Down' | 'Up' | 'Nearest'
	minimumRestMinutes?: number
	minimumRestMode?: 'Warn' | 'Block'
	overtime: OvertimeConfiguration
	approvalRules: AttendanceApprovalRule[]
}
export interface AttendancePolicyVersionView extends AttendancePolicyDraft {
	id: string
	versionId: string
	versionNumber: number
	revision: number
	state: AttendanceConfigurationState
}

/** Parse a closed source candidate selector; it identifies candidates but never creates authority. */
function candidateRule(value: unknown, field: string): AttendanceCandidateRule {
	const input = readBody(value, ['source'], ['managerLevel', 'functionCode', 'accountId'])
	const source = enumValue(input['source'], `${field}.source`, [
		'LineManager',
		'ManagerLevel',
		'Function',
		'NamedUser',
	])
	if (source === 'LineManager') {
		readBody(value, ['source'])
		return { source }
	}
	if (source === 'ManagerLevel') {
		readBody(value, ['source', 'managerLevel'])
		return {
			source,
			managerLevel: intValue(input['managerLevel'], `${field}.managerLevel`, 1, 2147483647),
		}
	}
	if (source === 'NamedUser') {
		readBody(value, ['source', 'accountId'])
		return { source, accountId: idValue(input['accountId'], `${field}.accountId`) }
	}
	readBody(value, ['source', 'functionCode'])
	return {
		source,
		functionCode: configurationText(input['functionCode'], `${field}.functionCode`, 120),
	}
}

/** Require explicit qualification, cap and preapproval behavior before overtime can be enabled. */
function overtimeConfiguration(value: unknown): OvertimeConfiguration {
	const input = readBody(value, ['enabled'], ['qualification', 'capMinutes', 'preapprovalRequired'])
	const enabled = boolValue(input['enabled'], 'overtime.enabled')
	if (!enabled) {
		readBody(value, ['enabled'])
		return { enabled: false }
	}
	return {
		enabled: true,
		qualification: enumValue(input['qualification'], 'overtime.qualification', [
			'ScheduledExcess',
			'RestDay',
			'Holiday',
		]),
		capMinutes: intValue(input['capMinutes'], 'overtime.capMinutes', 0, Number.MAX_SAFE_INTEGER),
		preapprovalRequired: boolValue(input['preapprovalRequired'], 'overtime.preapprovalRequired'),
	}
}

/** Enforce typed policy inputs and unconditional source independence without inventing statutory defaults. */
export function parseAttendancePolicyDraft(value: unknown): AttendancePolicyDraft {
	const input = readBody(
		value,
		[
			'code',
			'name',
			'effectiveFrom',
			'graceInMinutes',
			'graceOutMinutes',
			'rounding',
			'overtime',
			'approvalRules',
		],
		[
			'effectiveTo',
			'roundingIncrementMinutes',
			'roundingDirection',
			'minimumRestMinutes',
			'minimumRestMode',
		],
	)
	if (!Array.isArray(input['approvalRules'])) invalidField('approvalRules')
	const approvalRules = input['approvalRules'].map(
		/** Keep source rules in declared slot order and reject selectors for unadmitted authority sources. */ (
			value,
			index,
		): AttendanceApprovalRule => {
			const field = `approvalRules.${index}`
			const rule = readBody(value, ['subjectType', 'stage', 'independent', 'candidateRule'])
			const subjectType = enumValue(rule['subjectType'], `${field}.subjectType`, [
				'Correction',
				'Adjustment',
				'Overtime',
				'Roster',
				'Override',
				'AnomalyWaiver',
				'PeriodReopen',
			])
			const independent = boolValue(rule['independent'], `${field}.independent`)
			if (
				['Correction', 'Adjustment', 'Overtime', 'AnomalyWaiver', 'PeriodReopen'].includes(
					subjectType,
				) &&
				!independent
			)
				invalidField(`${field}.independent`, 'independent-approval-required')
			return {
				subjectType,
				stage: intValue(rule['stage'], `${field}.stage`, 1, 2147483647),
				independent,
				candidateRule: candidateRule(rule['candidateRule'], `${field}.candidateRule`),
			}
		},
	)
	const result: AttendancePolicyDraft = {
		...configurationIdentity(input),
		graceInMinutes: intValue(input['graceInMinutes'], 'graceInMinutes', 0, Number.MAX_SAFE_INTEGER),
		graceOutMinutes: intValue(
			input['graceOutMinutes'],
			'graceOutMinutes',
			0,
			Number.MAX_SAFE_INTEGER,
		),
		rounding: enumValue(input['rounding'], 'rounding', ['None', 'Configured']),
		overtime: overtimeConfiguration(input['overtime']),
		approvalRules,
	}
	if (result.rounding === 'Configured') {
		result.roundingIncrementMinutes = intValue(
			input['roundingIncrementMinutes'],
			'roundingIncrementMinutes',
			1,
			Number.MAX_SAFE_INTEGER,
		)
		result.roundingDirection = enumValue<'Down' | 'Up' | 'Nearest'>(
			input['roundingDirection'],
			'roundingDirection',
			['Down', 'Up', 'Nearest'],
		)
	} else if (
		input['roundingIncrementMinutes'] !== undefined ||
		input['roundingDirection'] !== undefined
	)
		invalidField('rounding', 'not-applicable')
	if (input['minimumRestMinutes'] !== undefined) {
		result.minimumRestMinutes = intValue(
			input['minimumRestMinutes'],
			'minimumRestMinutes',
			0,
			Number.MAX_SAFE_INTEGER,
		)
		result.minimumRestMode = enumValue<'Warn' | 'Block'>(
			input['minimumRestMode'],
			'minimumRestMode',
			['Warn', 'Block'],
		)
	} else if (input['minimumRestMode'] !== undefined)
		invalidField('minimumRestMode', 'not-applicable')
	const seen = new Set<string>()
	for (const rule of approvalRules) {
		const key = JSON.stringify(rule)
		if (seen.has(key)) invalidField('approvalRules', 'duplicate')
		seen.add(key)
	}
	for (const subject of new Set(
		approvalRules.map(
			/** Validate stage progression separately for each source case type. */ (rule) =>
				rule.subjectType,
		),
	)) {
		const stages = [
			...new Set(
				approvalRules
					.filter(
						/** Select one source case's configured stages. */ (rule) =>
							rule.subjectType === subject,
					)
					.map(/** Repeated stage numbers represent multiple slots. */ (rule) => rule.stage),
			),
		].sort(
			/** Require consecutive stage ordinals rather than lexical number ordering. */ (a, b) =>
				a - b,
		)
		if (
			stages.some(
				/** A missing predecessor cannot be silently skipped by coordination. */ (stage, index) =>
					stage !== index + 1,
			)
		)
			invalidField('approvalRules', 'noncontiguous-stages')
	}
	if (
		result.overtime.enabled &&
		!approvalRules.some(
			/** Actual qualifying time always needs an independently authorized manager, even without preapproval. */ (
				rule,
			) =>
				rule.subjectType === 'Overtime' &&
				rule.independent &&
				['LineManager', 'ManagerLevel'].includes(rule.candidateRule.source),
		)
	)
		invalidField('approvalRules', 'independent-overtime-manager-required')
	return result
}
