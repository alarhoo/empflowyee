import type { Kysely } from 'kysely'
import {
	EmployeePortBinder,
	PolicyProfileFieldVisibility,
	TeamScopeResolver,
	type EmployeePorts,
} from '@empflowyee/hcm-api-employee-application'
import {
	OrgChartFieldPolicyBinder,
	WorkforcePortBinder,
	type OrgChartField,
	type OrgChartFieldPolicy,
	type WorkforceActor,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyProfilePolicyReader } from './profile-policy-reader'

/** Org-chart fields and the standard profile fields that govern them. */
const ORG_CHART_FIELDS: readonly OrgChartField[] = [
	'preferred-name',
	'worker-number',
	'work-email',
	'organisation-unit',
	'department',
	'designation',
	'location',
	'manager',
	'work-mode',
]

/** Build the policy-backed visibility port on a transaction. */
function visibility(transaction: unknown, actor: WorkforceActor) {
	return new PolicyProfileFieldVisibility(
		new KyselyProfilePolicyReader({
			executor: transaction as Kysely<unknown>,
			tenantId: actor.tenantId,
			accountId: actor.accountId,
		}),
	)
}

/** Employee ports over Kysely, reading workforce facts only through the workforce ports. */
export class KyselyEmployeePortBinder extends EmployeePortBinder {
	/** Reuse the workforce binder so team scope reads the same transaction. */
	constructor(private readonly workforce: WorkforcePortBinder) {
		super()
	}

	/** Return ports that run inside the given transaction as the given actor. */
	bind(transaction: unknown, actor: WorkforceActor): EmployeePorts {
		return {
			visibility: visibility(transaction, actor),
			team: new TeamScopeResolver(this.workforce.bind(transaction, actor).reads),
		}
	}
}

/** The employee implementation of the org chart's field policy (Organization relation). */
export class KyselyOrgChartFieldPolicyBinder extends OrgChartFieldPolicyBinder {
	/** Return a policy that reads inside the given transaction as the given actor. */
	bind(transaction: unknown, actor: WorkforceActor): OrgChartFieldPolicy {
		const port = visibility(transaction, actor)
		return {
			/** Map the Organization allowlist onto org-chart fields. */
			async organizationFields(workerIds: readonly string[]) {
				const visible = await port.visibleFields('Organization', workerIds)
				return new Map(
					[...visible].map(
						/** One worker. */ ([workerId, refs]) => [
							workerId,
							new Set(
								ORG_CHART_FIELDS.filter(
									/** Allowed field. */ (field) => refs.has(`standard:${field}`),
								),
							),
						],
					),
				)
			},
		}
	}
}
