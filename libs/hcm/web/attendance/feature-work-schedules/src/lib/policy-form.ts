import {
	parseAttendancePolicyDraft,
	type AttendancePolicyDraft,
	type AttendancePolicyVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { invalidField } from '@empflowyee/hcm-runtime-contract'

export interface PolicyRuleForm {
	subjectType: string
	stage: string
	independent: string
	source: string
	managerLevel: string
	functionCode: string
	accountId: string
}
export interface PolicyForm {
	code: string
	name: string
	effectiveFrom: string
	effectiveTo: string
	graceInMinutes: string
	graceOutMinutes: string
	rounding: string
	roundingIncrementMinutes: string
	roundingDirection: string
	minimumRestEnabled: boolean
	minimumRestMinutes: string
	minimumRestMode: string
	overtimeEnabled: string
	qualification: string
	capMinutes: string
	preapprovalRequired: string
	approvalRules: PolicyRuleForm[]
}
/** Empty fields require deliberate policy choices; no business grace, rounding or overtime defaults are fabricated. */
export function emptyPolicyForm(): PolicyForm {
	return {
		code: '',
		name: '',
		effectiveFrom: '',
		effectiveTo: '',
		graceInMinutes: '',
		graceOutMinutes: '',
		rounding: '',
		roundingIncrementMinutes: '',
		roundingDirection: '',
		minimumRestEnabled: false,
		minimumRestMinutes: '',
		minimumRestMode: '',
		overtimeEnabled: '',
		qualification: '',
		capMinutes: '',
		preapprovalRequired: '',
		approvalRules: [],
	}
}
/** A newly added approval slot is incomplete until its source, stage and independence are chosen. */
export function emptyPolicyRule(): PolicyRuleForm {
	return {
		subjectType: '',
		stage: '',
		independent: '',
		source: '',
		managerLevel: '',
		functionCode: '',
		accountId: '',
	}
}
/** Preserve blank or malformed numeric input as an error rather than turning it into zero. */
function numberValue(value: string, field: string): number {
	if (!/^\d+$/.test(value)) invalidField(field)
	return Number(value)
}
/** Convert only an explicitly selected boolean; an empty choice is not false. */
function booleanValue(value: string, field: string): boolean {
	if (value !== 'true' && value !== 'false') invalidField(field)
	return value === 'true'
}
/** Build the closed policy DTO with universal cross-field and exact numeric validation. */
export function policyFromForm(model: PolicyForm): AttendancePolicyDraft {
	const overtimeEnabled = booleanValue(model.overtimeEnabled, 'overtime.enabled')
	return parseAttendancePolicyDraft({
		code: model.code,
		name: model.name,
		effectiveFrom: model.effectiveFrom,
		...(model.effectiveTo ? { effectiveTo: model.effectiveTo } : {}),
		graceInMinutes: numberValue(model.graceInMinutes, 'graceInMinutes'),
		graceOutMinutes: numberValue(model.graceOutMinutes, 'graceOutMinutes'),
		rounding: model.rounding,
		...(model.rounding === 'Configured'
			? {
				roundingIncrementMinutes: numberValue(
					model.roundingIncrementMinutes,
					'roundingIncrementMinutes',
				),
				roundingDirection: model.roundingDirection,
			}
			: {}),
		...(model.minimumRestEnabled
			? {
				minimumRestMinutes: numberValue(model.minimumRestMinutes, 'minimumRestMinutes'),
				minimumRestMode: model.minimumRestMode,
			}
			: {}),
		overtime: overtimeEnabled
			? {
				enabled: true,
				qualification: model.qualification,
				capMinutes: numberValue(model.capMinutes, 'overtime.capMinutes'),
				preapprovalRequired: booleanValue(
					model.preapprovalRequired,
					'overtime.preapprovalRequired',
				),
			}
			: { enabled: false },
		approvalRules: model.approvalRules.map(
			/** Preserve the declared source and slot order without manufacturing authority. */ (
				rule,
				index,
			) => ({
				subjectType: rule.subjectType,
				stage: numberValue(rule.stage, `approvalRules.${index}.stage`),
				independent: booleanValue(rule.independent, `approvalRules.${index}.independent`),
				candidateRule: {
					source: rule.source,
					...(rule.source === 'ManagerLevel'
						? {
							managerLevel: numberValue(
								rule.managerLevel,
								`approvalRules.${index}.candidateRule.managerLevel`,
							),
						}
						: {}),
					...(rule.source === 'Function' ? { functionCode: rule.functionCode } : {}),
					...(rule.source === 'NamedUser' ? { accountId: rule.accountId } : {}),
				},
			}),
		),
	})
}
/** Restore every persisted rule field while excluding immutable version metadata from the form. */
export function policyFormFromVersion(source: AttendancePolicyVersionView): PolicyForm {
	return {
		...emptyPolicyForm(),
		code: source.code,
		name: source.name,
		effectiveFrom: source.effectiveFrom,
		effectiveTo: source.effectiveTo ?? '',
		graceInMinutes: String(source.graceInMinutes),
		graceOutMinutes: String(source.graceOutMinutes),
		rounding: source.rounding,
		roundingIncrementMinutes:
			source.roundingIncrementMinutes === undefined ? '' : String(source.roundingIncrementMinutes),
		roundingDirection: source.roundingDirection ?? '',
		minimumRestEnabled: source.minimumRestMinutes !== undefined,
		minimumRestMinutes:
			source.minimumRestMinutes === undefined ? '' : String(source.minimumRestMinutes),
		minimumRestMode: source.minimumRestMode ?? '',
		overtimeEnabled: String(source.overtime.enabled),
		...(source.overtime.enabled
			? {
				qualification: source.overtime.qualification,
				capMinutes: String(source.overtime.capMinutes),
				preapprovalRequired: String(source.overtime.preapprovalRequired),
			}
			: {}),
		approvalRules: source.approvalRules.map(
			/** Keep inactive selector fields empty rather than mixing candidate shapes. */ (rule) => ({
				...emptyPolicyRule(),
				subjectType: rule.subjectType,
				stage: String(rule.stage),
				independent: String(rule.independent),
				source: rule.candidateRule.source,
				...(rule.candidateRule.source === 'ManagerLevel'
					? { managerLevel: String(rule.candidateRule.managerLevel) }
					: {}),
				...(rule.candidateRule.source === 'Function'
					? { functionCode: rule.candidateRule.functionCode }
					: {}),
				...(rule.candidateRule.source === 'NamedUser'
					? { accountId: rule.candidateRule.accountId }
					: {}),
			}),
		),
	}
}
