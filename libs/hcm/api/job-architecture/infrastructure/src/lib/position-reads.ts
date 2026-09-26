import { sql, type Kysely, type RawBuilder } from 'kysely'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import type {
	EffectiveRequirementDto,
	RequirementDto,
	VarianceDraft,
} from '@empflowyee/hcm-job-architecture-contract'
import {
	capacityDecision,
	effectiveRequirements,
	type CapacityDecision,
} from '@empflowyee/hcm-api-job-architecture-domain'
import {
	PositionReadPortBinder,
	type PositionPlacement,
	type PositionReadPort,
} from '@empflowyee/hcm-api-job-architecture-application'
import type {
	PositionOccupancyPort,
	WorkforcePortBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { JobArchitectureScope } from './catalogue-reader'

/** Requirement columns shared by profile requirements and position variances. */
const REQUIREMENT_COLUMNS = sql`requirement_code AS code,requirement_type AS type,name,description,proficiency_level AS proficiency,
	minimum_quantity::float8 AS "minimumQuantity",quantity_unit AS unit,is_mandatory AS mandatory,sort_order AS "sortOrder"`

/** Published position facts, occupancy-backed capacity and effective requirements. */
export class KyselyPositionReads implements PositionReadPort {
	/** Bind to the caller's transaction and the workforce occupancy port in the same transaction. */
	constructor(
		protected readonly scope: JobArchitectureScope,
		protected readonly occupancy: PositionOccupancyPort,
	) {}

	/** Execute one query and classify integrity failures safely. */
	protected async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** The published version effective on a date. */
	async placement(positionId: string, asOf: string): Promise<PositionPlacement | undefined> {
		const t = this.scope.tenantId
		return (
			await this.run(
				sql<PositionPlacement>`SELECT p.id AS "positionId",p.code,p.name,p.lifecycle_status AS "lifecycleStatus",v.id AS "versionId",
					v.job_profile_version_id AS "profileVersionId",v.job_grade_id AS "gradeId",v.designation_id AS "designationId",
					v.legal_entity_id AS "legalEntityId",v.organisation_id AS "unitId",v.department_id AS "departmentId",v.location_id AS "locationId",
					v.headcount_capacity AS "headcountCapacity",v.fte_capacity::float8 AS "fteCapacity"
				FROM hcm.position p JOIN hcm.position_version v ON v.tenant_id=p.tenant_id AND v.position_id=p.id
				WHERE p.tenant_id=${t} AND p.id=${positionId} AND v.status IN ('Published','Superseded') AND v.effective_period @> ${asOf}::date`,
			)
		)[0]
	}

	/** DEC-HCM2-007 decision from published capacity and complete occupancy. */
	async capacityDecision(
		positionId: string,
		asOf: string,
		addedHeadcount: number,
		addedFte: number,
	): Promise<CapacityDecision | 'not-open'> {
		const placement = await this.placement(positionId, asOf)
		if (!placement || placement.lifecycleStatus !== 'Open') return 'not-open'
		const occupancy = (await this.occupancy.occupancy([positionId], asOf)).get(positionId)
		return capacityDecision(
			placement,
			occupancy ?? { headcount: null, fte: null, complete: false },
			addedHeadcount,
			addedFte,
		)
	}

	/** Requirements of one profile version in profile order. */
	async profileRequirements(profileVersionId: string): Promise<RequirementDto[]> {
		return this.run(
			sql<RequirementDto>`SELECT ${REQUIREMENT_COLUMNS} FROM hcm.job_profile_requirement
				WHERE tenant_id=${this.scope.tenantId} AND job_profile_version_id=${profileVersionId} ORDER BY sort_order,requirement_code`,
		)
	}

	/** Variances of one position version, without justifications. */
	async variances(positionVersionId: string): Promise<Omit<VarianceDraft, 'justification'>[]> {
		const t = this.scope.tenantId
		return this.run(
			sql<
				Omit<VarianceDraft, 'justification'>
			>`SELECT r.requirement_code AS code,r.variance_type AS "varianceType",s.requirement_code AS "sourceCode",
					r.requirement_type AS type,r.name,r.description,r.proficiency_level AS proficiency,r.minimum_quantity::float8 AS "minimumQuantity",
					r.quantity_unit AS unit,r.is_mandatory AS mandatory
				FROM hcm.position_requirement r LEFT JOIN hcm.job_profile_requirement s ON s.tenant_id=r.tenant_id AND s.id=r.source_job_profile_requirement_id
				WHERE r.tenant_id=${t} AND r.position_version_id=${positionVersionId} ORDER BY r.sort_order,r.requirement_code`,
		)
	}

	/** Effective requirements of the version effective on a date. */
	async effectiveRequirements(
		positionId: string,
		asOf: string,
	): Promise<EffectiveRequirementDto[]> {
		const placement = await this.placement(positionId, asOf)
		if (!placement) return []
		return effectiveRequirements(
			await this.profileRequirements(placement.profileVersionId),
			await this.variances(placement.versionId),
		)
	}
}

/** Binds position reads and the workforce occupancy port to one caller transaction. */
export class KyselyPositionReadPortBinder extends PositionReadPortBinder {
	/** Compose with the workforce port binder. */
	constructor(private readonly workforce: WorkforcePortBinder) {
		super()
	}

	/** Return a port that reads inside the given transaction as the given actor. */
	bind(transaction: unknown, actor: { tenantId: string; accountId: string }): PositionReadPort {
		return new KyselyPositionReads(
			{ executor: transaction as Kysely<unknown>, ...actor },
			this.workforce.bind(transaction, actor).occupancy,
		)
	}
}
