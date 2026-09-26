import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type RawBuilder } from 'kysely'
import { HcmDomainError, invalidField } from '@empflowyee/hcm-runtime-contract'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import { organisationToday } from './business-date'
import {
	WorkforcePortBinder,
	type AssignmentFact,
	type AssignmentFacts,
	type CreateEmployment,
	type CreatePersonWithWorker,
	type DuplicateCandidate,
	type EmploymentFactsChange,
	type PersonFacts,
	type ReportingEdge,
	type Revisioned,
	type SetReportingLine,
	type WorkerEventInput,
	type WorkforceActor,
	type WorkforceFactsPort,
	type WorkforceReadPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	ENGAGED_STATUSES,
	dayBefore,
	matchName,
	personDisplayName,
	personSearchText,
	requireAfter,
	requireNoReportingCycle,
	requireRevision,
	requireWithinEmployment,
} from '@empflowyee/hcm-api-workforce-foundation-domain'
import type { WorkforceScope } from './structure-repository'

/** Deepest manager chain walked when checking reporting cycles. */
const CHAIN_LIMIT = 50

interface AssignmentRow {
	id: string
	employmentId: string
	effectiveFrom: string | null
	effectiveTo: string | null
	supersededById: string | null
	revision: number
}

/** Shared SQL execution with safe integrity-error classification. */
abstract class WorkforceSql {
	/** Bind SQL to the caller's authorized transaction and actor. */
	constructor(protected readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures as domain errors. */
	protected async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Execute one query expected to return at most one row. */
	protected async one<T>(query: RawBuilder<T>): Promise<T | undefined> {
		return (await this.run(query))[0]
	}
}

/** Workforce commands over PostgreSQL; the only writer of people and employment facts. */
export class KyselyWorkforceFacts extends WorkforceSql implements WorkforceFactsPort {
	/** The acting account, recorded on every write. */
	private get actor(): string {
		return this.scope.accountId
	}

	/** Validate required name facts before any write. */
	private names(facts: PersonFacts): void {
		if (!facts.givenName.trim()) invalidField('givenName', 'required')
		if (!facts.familyName.trim()) invalidField('familyName', 'required')
	}

	/** Require an active tenant lookup or structure reference, reporting the named field. */
	private async requireActive(
		table: RawBuilder<unknown>,
		id: string,
		field: string,
	): Promise<void> {
		const row = await this.one(
			sql<{
				ok: boolean
			}>`SELECT true AS ok FROM ${table} WHERE tenant_id=${this.scope.tenantId} AND id=${id} AND is_active`,
		)
		if (!row) invalidField(field, 'unknown')
	}

	/** Create a person and their single worker record. */
	async createPersonWithWorker(
		input: CreatePersonWithWorker,
	): Promise<{ person: Revisioned; worker: Revisioned }> {
		const f = input.facts
		this.names(f)
		if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(input.workerCode)) invalidField('workerCode')
		await this.requireActive(sql`hcm.worker_type`, input.workerTypeId, 'workerTypeId')
		const personId = randomUUID()
		const workerId = randomUUID()
		await this.run(
			sql`INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name,middle_name,preferred_name,former_name,birth_date,gender_code,marital_status_code,nationality_country_code,search_text,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${personId},${f.givenName.trim()},${f.familyName.trim()},${personDisplayName(f.givenName, f.preferredName, f.familyName)},${f.middleName.trim()},${f.preferredName.trim()},${f.formerName.trim()},${f.birthDate},${f.genderCode},${f.maritalStatusCode},${f.nationalityCountryCode},${personSearchText(f.givenName, f.preferredName, f.familyName)},${this.actor},${this.actor})`,
		)
		await this.run(
			sql`INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code,worker_type_id,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${workerId},${personId},${input.workerCode},${input.workerTypeId},${this.actor},${this.actor})`,
		)
		return { person: { id: personId, revision: 1 }, worker: { id: workerId, revision: 1 } }
	}

	/** Correct a person's names and personal facts at the expected revision. */
	async correctPersonFacts(
		personId: string,
		expectedRevision: number,
		f: PersonFacts,
	): Promise<Revisioned> {
		this.names(f)
		const current = await this.one(
			sql<{
				revision: number
				active: boolean
			}>`SELECT revision,is_active AS active FROM hcm.person WHERE tenant_id=${this.scope.tenantId} AND id=${personId} FOR UPDATE`,
		)
		if (!current) throw new HcmDomainError('not-found')
		if (!current.active) throw new HcmDomainError('invalid-state')
		requireRevision(current.revision, expectedRevision)
		await this.run(
			sql`UPDATE hcm.person SET given_name=${f.givenName.trim()},family_name=${f.familyName.trim()},display_name=${personDisplayName(f.givenName, f.preferredName, f.familyName)},middle_name=${f.middleName.trim()},preferred_name=${f.preferredName.trim()},former_name=${f.formerName.trim()},birth_date=${f.birthDate},gender_code=${f.genderCode},marital_status_code=${f.maritalStatusCode},nationality_country_code=${f.nationalityCountryCode},search_text=${personSearchText(f.givenName, f.preferredName, f.familyName)},revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor} WHERE tenant_id=${this.scope.tenantId} AND id=${personId}`,
		)
		return { id: personId, revision: current.revision + 1 }
	}

	/** Mark a duplicate merged into a survivor; blocked once the duplicate has an established employment. */
	async mergePerson(
		duplicatePersonId: string,
		survivorPersonId: string,
		expectedRevision: number,
	): Promise<Revisioned> {
		if (duplicatePersonId === survivorPersonId) invalidField('survivorPersonId', 'self')
		const rows = await this.run(
			sql<{
				id: string
				revision: number
				active: boolean
			}>`SELECT id,revision,is_active AS active FROM hcm.person WHERE tenant_id=${this.scope.tenantId} AND id IN (${duplicatePersonId},${survivorPersonId}) ORDER BY id FOR UPDATE`,
		)
		const duplicate = rows.find(/** Duplicate row. */ (row) => row.id === duplicatePersonId)
		const survivor = rows.find(/** Survivor row. */ (row) => row.id === survivorPersonId)
		if (!duplicate || !survivor) throw new HcmDomainError('not-found')
		if (!duplicate.active || !survivor.active) throw new HcmDomainError('invalid-state')
		requireRevision(duplicate.revision, expectedRevision)
		const engaged = await this.one(
			sql<{
				ok: boolean
			}>`SELECT true AS ok FROM hcm.employment e JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id WHERE e.tenant_id=${this.scope.tenantId} AND w.person_id=${duplicatePersonId} AND e.hire_date IS NOT NULL LIMIT 1`,
		)
		if (engaged) throw new HcmDomainError('merge-requires-correction')
		await this.run(
			sql`UPDATE hcm.person SET is_active=false,merged_into_person_id=${survivorPersonId},revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor} WHERE tenant_id=${this.scope.tenantId} AND id=${duplicatePersonId}`,
		)
		return { id: duplicatePersonId, revision: duplicate.revision + 1 }
	}

	/** Create an established employment and update the worker's engagement facts. */
	async createEmployment(input: CreateEmployment): Promise<Revisioned> {
		const worker = await this.one(
			sql<{
				id: string
			}>`SELECT id FROM hcm.worker WHERE tenant_id=${this.scope.tenantId} AND id=${input.workerId} FOR UPDATE`,
		)
		if (!worker) throw new HcmDomainError('not-found')
		await this.requireActive(sql`hcm.legal_entity`, input.legalEntityId, 'legalEntityId')
		// The legacy organisation_id keeps meaning "legal-entity-bearing unit".
		const unit = await this.one(
			sql<{
				id: string
			}>`SELECT o.id FROM hcm.organisation o JOIN hcm.organisation_version v ON v.tenant_id=o.tenant_id AND v.organisation_id=o.id AND v.effective_period @> ${input.hireDate}::date WHERE o.tenant_id=${this.scope.tenantId} AND v.legal_entity_id=${input.legalEntityId} ORDER BY o.code COLLATE "C" LIMIT 1`,
		)
		if (!unit) invalidField('legalEntityId', 'no-unit')
		const sequence = await this.one(
			sql<{
				next: number
			}>`SELECT count(*)::int + 1 AS next FROM hcm.employment WHERE tenant_id=${this.scope.tenantId} AND worker_id=${input.workerId} AND hire_date IS NOT NULL`,
		)
		const id = randomUUID()
		await this.run(
			sql`INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id,legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment,work_email,continuous_service_start_date,probation_end_date,probation_status,notice_period_days,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${id},${input.workerId},${unit?.id ?? null},${input.legalEntityId},${input.employmentType},${input.employmentStatus},${input.hireDate}::date,${sequence?.next ?? 1},${input.isPrimary},${input.workEmail},${input.continuousServiceStartDate ?? input.hireDate}::date,${input.probationEndDate}::date,${input.probationStatus},${input.noticePeriodDays},${this.actor},${this.actor})`,
		)
		await this.refreshEngagement(input.workerId)
		return { id, revision: 1 }
	}

	/** Recompute the worker's denormalized engagement facts from established employments. */
	private async refreshEngagement(workerId: string): Promise<void> {
		const engaged = [...ENGAGED_STATUSES]
		await this.run(
			sql`UPDATE hcm.worker w SET first_engagement_start_date=f.first,is_currently_engaged=f.engaged,latest_engagement_end_date=CASE WHEN f.engaged THEN NULL ELSE f.last END,revision=w.revision+1,updated_at=now(),updated_by_account_id=${this.actor} FROM (SELECT min(hire_date) AS first,max(employment_end_date) AS last,bool_or(employment_status = ANY(${engaged}::text[])) AS engaged FROM hcm.employment WHERE tenant_id=${this.scope.tenantId} AND worker_id=${workerId} AND hire_date IS NOT NULL) f WHERE w.tenant_id=${this.scope.tenantId} AND w.id=${workerId} AND f.first IS NOT NULL`,
		)
	}

	/** Lock an established employment for an assignment or fact change. */
	private async employment(employmentId: string) {
		const row = await this.one(
			sql<{
				workerId: string
				hireDate: string | null
				endDate: string | null
				revision: number
			}>`SELECT worker_id AS "workerId",to_char(hire_date,'YYYY-MM-DD') AS "hireDate",to_char(employment_end_date,'YYYY-MM-DD') AS "endDate",revision FROM hcm.employment WHERE tenant_id=${this.scope.tenantId} AND id=${employmentId} FOR UPDATE`,
		)
		if (!row) throw new HcmDomainError('not-found')
		if (row.hireDate === null) throw new HcmDomainError('record-incomplete')
		return { ...row, hireDate: row.hireDate }
	}

	/** Require the assignment's structure references to be usable on its start date. */
	private async assignmentReferences(facts: AssignmentFacts): Promise<void> {
		if (!facts.jobTitle.trim() || facts.jobTitle.length > 200) invalidField('jobTitle')
		if (!(facts.fullTimeEquivalent > 0 && facts.fullTimeEquivalent <= 1))
			invalidField('fullTimeEquivalent')
		const unit = await this.one(
			sql<{
				ok: boolean
			}>`SELECT true AS ok FROM hcm.organisation o JOIN hcm.organisation_version v ON v.tenant_id=o.tenant_id AND v.organisation_id=o.id AND v.effective_period @> ${facts.effectiveFrom}::date WHERE o.tenant_id=${this.scope.tenantId} AND o.id=${facts.organisationId} AND o.is_active`,
		)
		if (!unit) invalidField('organisationId', 'not-effective')
		await this.requireActive(sql`hcm.location`, facts.locationId, 'locationId')
		if (facts.departmentId)
			await this.requireActive(sql`hcm.department`, facts.departmentId, 'departmentId')
		if (facts.designationId)
			await this.requireActive(sql`hcm.designation`, facts.designationId, 'designationId')
	}

	/** Insert one established assignment row. */
	private async insertAssignment(employmentId: string, facts: AssignmentFacts): Promise<string> {
		const id = randomUUID()
		await this.run(
			sql`INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,department_id,designation_id,work_mode,full_time_equivalent,standard_hours_per_week,is_primary_assignment,is_billable,cost_center_code,effective_from,change_note,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${id},${employmentId},${facts.organisationId},${facts.locationId},${facts.jobTitle.trim()},${facts.departmentId},${facts.designationId},${facts.workMode},${facts.fullTimeEquivalent},${facts.standardHoursPerWeek},${facts.isPrimary},${facts.isBillable},${facts.costCenterCode.trim()},${facts.effectiveFrom}::date,${facts.changeNote.trim()},${this.actor},${this.actor})`,
		)
		return id
	}

	/** Open the first dated assignment of an established employment. */
	async openAssignment(employmentId: string, facts: AssignmentFacts): Promise<Revisioned> {
		const employment = await this.employment(employmentId)
		requireWithinEmployment(employment.hireDate, employment.endDate, facts.effectiveFrom)
		await this.assignmentReferences(facts)
		return { id: await this.insertAssignment(employmentId, facts), revision: 1 }
	}

	/** Close an open assignment the day before and open its successor, carrying reporting lines. */
	async supersedeAssignment(
		assignmentId: string,
		expectedRevision: number,
		facts: AssignmentFacts,
	): Promise<{ closed: Revisioned; opened: Revisioned }> {
		const current = await this.one(
			sql<AssignmentRow>`SELECT id,employment_id AS "employmentId",to_char(effective_from,'YYYY-MM-DD') AS "effectiveFrom",to_char(effective_to,'YYYY-MM-DD') AS "effectiveTo",superseded_by_id AS "supersededById",revision FROM hcm.assignment WHERE tenant_id=${this.scope.tenantId} AND id=${assignmentId} FOR UPDATE`,
		)
		if (!current) throw new HcmDomainError('not-found')
		if (current.effectiveFrom === null) throw new HcmDomainError('record-incomplete')
		requireRevision(current.revision, expectedRevision)
		if (current.effectiveTo !== null || current.supersededById !== null)
			throw new HcmDomainError('invalid-state')
		requireAfter(current.effectiveFrom, facts.effectiveFrom)
		const employment = await this.employment(current.employmentId)
		requireWithinEmployment(employment.hireDate, employment.endDate, facts.effectiveFrom)
		await this.assignmentReferences(facts)
		const closeOn = dayBefore(facts.effectiveFrom)
		await this.run(
			sql`UPDATE hcm.assignment SET effective_to=${closeOn}::date,revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor} WHERE tenant_id=${this.scope.tenantId} AND id=${assignmentId}`,
		)
		const openedId = await this.insertAssignment(current.employmentId, facts)
		await this.run(
			sql`UPDATE hcm.assignment SET superseded_by_id=${openedId},updated_at=now(),updated_by_account_id=${this.actor} WHERE tenant_id=${this.scope.tenantId} AND id=${assignmentId}`,
		)
		await this.carryLines(assignmentId, openedId, facts.effectiveFrom, closeOn)
		return {
			closed: { id: assignmentId, revision: current.revision + 1 },
			opened: { id: openedId, revision: 1 },
		}
	}

	/** Move lines open on the successor's start date from the closed assignment to its successor. */
	private async carryLines(
		fromId: string,
		toId: string,
		startOn: string,
		closeOn: string,
	): Promise<void> {
		const lines = await this.run(
			sql<{
				id: string
				assignmentId: string
				managerAssignmentId: string
				type: string
				primary: boolean
				reason: string
			}>`SELECT id,assignment_id AS "assignmentId",manager_assignment_id AS "managerAssignmentId",reporting_line_type AS type,is_primary AS primary,reason FROM hcm.reporting_line WHERE tenant_id=${this.scope.tenantId} AND (assignment_id=${fromId} OR manager_assignment_id=${fromId}) AND effective_period @> ${startOn}::date AND effective_from < ${startOn}::date ORDER BY id FOR UPDATE`,
		)
		for (const line of lines) {
			await this.run(
				sql`UPDATE hcm.reporting_line SET effective_to=${closeOn}::date,revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor} WHERE tenant_id=${this.scope.tenantId} AND id=${line.id}`,
			)
			const assignment = line.assignmentId === fromId ? toId : line.assignmentId
			const manager = line.managerAssignmentId === fromId ? toId : line.managerAssignmentId
			await this.run(
				sql`INSERT INTO hcm.reporting_line(tenant_id,id,assignment_id,manager_assignment_id,reporting_line_type,is_primary,effective_from,reason,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${randomUUID()},${assignment},${manager},${line.type},${line.primary},${startOn}::date,${line.reason},${this.actor},${this.actor})`,
			)
		}
	}

	/** Require an established assignment effective on a date. */
	private async effectiveAssignment(id: string, on: string, field: string): Promise<void> {
		const row = await this.one(
			sql<{
				ok: boolean
			}>`SELECT true AS ok FROM hcm.assignment WHERE tenant_id=${this.scope.tenantId} AND id=${id} AND effective_period @> ${on}::date`,
		)
		if (!row) invalidField(field, 'not-effective')
	}

	/** Walk a manager's primary solid chain on a date, nearest first. */
	private async managerChain(managerAssignmentId: string, on: string): Promise<string[]> {
		const chain = [managerAssignmentId]
		let current = managerAssignmentId
		for (let depth = 0; depth < CHAIN_LIMIT; depth++) {
			const next = await this.one(
				sql<{
					manager: string
				}>`SELECT manager_assignment_id AS manager FROM hcm.reporting_line WHERE tenant_id=${this.scope.tenantId} AND assignment_id=${current} AND is_primary AND effective_period @> ${on}::date`,
			)
			if (!next || chain.includes(next.manager)) break
			chain.push(next.manager)
			current = next.manager
		}
		return chain
	}

	/** Start a reporting line; a primary line closes the current primary line the day before. */
	async setReportingLine(input: SetReportingLine): Promise<Revisioned> {
		if (input.isPrimary && input.type !== 'Solid') invalidField('type', 'primary-solid')
		if (input.reason.length > 500) invalidField('reason')
		await this.effectiveAssignment(input.assignmentId, input.effectiveFrom, 'assignmentId')
		await this.effectiveAssignment(
			input.managerAssignmentId,
			input.effectiveFrom,
			'managerAssignmentId',
		)
		if (input.isPrimary) {
			requireNoReportingCycle(
				input.assignmentId,
				await this.managerChain(input.managerAssignmentId, input.effectiveFrom),
			)
			const open = await this.one(
				sql<{
					id: string
					from: string
				}>`SELECT id,to_char(effective_from,'YYYY-MM-DD') AS "from" FROM hcm.reporting_line WHERE tenant_id=${this.scope.tenantId} AND assignment_id=${input.assignmentId} AND is_primary AND effective_period @> ${input.effectiveFrom}::date FOR UPDATE`,
			)
			if (open) {
				requireAfter(open.from, input.effectiveFrom)
				await this.run(
					sql`UPDATE hcm.reporting_line SET effective_to=${dayBefore(input.effectiveFrom)}::date,revision=revision+1,updated_at=now(),updated_by_account_id=${this.actor} WHERE tenant_id=${this.scope.tenantId} AND id=${open.id}`,
				)
			}
		}
		const id = randomUUID()
		await this.run(
			sql`INSERT INTO hcm.reporting_line(tenant_id,id,assignment_id,manager_assignment_id,reporting_line_type,is_primary,effective_from,reason,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${id},${input.assignmentId},${input.managerAssignmentId},${input.type},${input.isPrimary},${input.effectiveFrom}::date,${input.reason.trim()},${this.actor},${this.actor})`,
		)
		return { id, revision: 1 }
	}

	/** Change employment facts, keeping worker engagement current. */
	async applyEmploymentFacts(
		employmentId: string,
		change: EmploymentFactsChange,
	): Promise<Revisioned> {
		const employment = await this.employment(employmentId)
		requireRevision(employment.revision, change.expectedRevision)
		if (change.employmentEndReasonId)
			await this.requireActive(
				sql`hcm.employment_end_reason`,
				change.employmentEndReasonId,
				'employmentEndReasonId',
			)
		const columns: [keyof EmploymentFactsChange, string, string][] = [
			['employmentStatus', 'employment_status', 'text'],
			['workEmail', 'work_email', 'text'],
			['probationEndDate', 'probation_end_date', 'date'],
			['probationStatus', 'probation_status', 'text'],
			['confirmedOn', 'confirmed_on', 'date'],
			['noticePeriodDays', 'notice_period_days', 'smallint'],
			['resignationSubmittedOn', 'resignation_submitted_on', 'date'],
			['lastWorkingDate', 'last_working_date', 'date'],
			['employmentEndDate', 'employment_end_date', 'date'],
			['employmentEndReasonId', 'employment_end_reason_id', 'text'],
			['isEligibleForRehire', 'is_eligible_for_rehire', 'boolean'],
			['rehireEligibilityNote', 'rehire_eligibility_note', 'text'],
		]
		const sets = columns
			.filter(/** Only provided facts change. */ ([key]) => change[key] !== undefined)
			.map(
				/** Bind one typed assignment; column names come from the fixed table above. */ ([
					key,
					column,
					type,
				]) => sql`${sql.ref(column)}=${change[key] ?? null}::${sql.raw(type)}`,
			)
		await this.run(
			sql`UPDATE hcm.employment SET ${sql.join([...sets, sql`revision=revision+1`, sql`updated_at=now()`, sql`updated_by_account_id=${this.actor}`])} WHERE tenant_id=${this.scope.tenantId} AND id=${employmentId}`,
		)
		if (change.employmentStatus !== undefined || change.employmentEndDate !== undefined)
			await this.refreshEngagement(employment.workerId)
		return { id: employmentId, revision: employment.revision + 1 }
	}

	/** Append one worker lifecycle event. */
	async recordWorkerEvent(input: WorkerEventInput): Promise<{ id: string }> {
		if (input.reason.length > 500) invalidField('reason')
		const type = await this.one(
			sql<{
				id: string
			}>`SELECT id FROM hcm.worker_event_type WHERE tenant_id=${this.scope.tenantId} AND code=${input.eventTypeCode} AND is_active`,
		)
		if (!type) invalidField('eventTypeCode', 'unknown')
		if (input.employmentId) {
			const owned = await this.one(
				sql<{
					ok: boolean
				}>`SELECT true AS ok FROM hcm.employment WHERE tenant_id=${this.scope.tenantId} AND id=${input.employmentId} AND worker_id=${input.workerId}`,
			)
			if (!owned) invalidField('employmentId', 'unknown')
		}
		if (input.assignmentId) {
			const owned = await this.one(
				sql<{
					ok: boolean
				}>`SELECT true AS ok FROM hcm.assignment WHERE tenant_id=${this.scope.tenantId} AND id=${input.assignmentId} AND employment_id=${input.employmentId}`,
			)
			if (!owned) invalidField('assignmentId', 'unknown')
		}
		const id = randomUUID()
		await this.run(
			sql`INSERT INTO hcm.worker_event(tenant_id,id,worker_id,employment_id,assignment_id,worker_event_type_id,effective_date,reason,approved_by_account_id,approved_on,previous_value_summary,new_value_summary,created_by_account_id) VALUES(${this.scope.tenantId},${id},${input.workerId},${input.employmentId},${input.assignmentId},${type?.id ?? null},${input.effectiveDate}::date,${input.reason.trim()},${input.approvedByAccountId},${input.approvedOn}::date,${input.previousValueSummary},${input.newValueSummary},${this.actor})`,
		)
		return { id }
	}
}

/** As-of workforce projections over established rows. */
export class KyselyWorkforceReads extends WorkforceSql implements WorkforceReadPort {
	/** Today's business date in the organisation time zone. */
	businessToday(): Promise<string> {
		return organisationToday(this.scope.executor, this.scope.tenantId)
	}

	/** The worker of the person linked to an account. */
	async accountWorker(accountId: string): Promise<string | null> {
		return (
			(
				await this.run(
					sql<{
						id: string
					}>`SELECT w.id FROM hcm.user_account u JOIN hcm.worker w ON w.tenant_id=u.tenant_id AND w.person_id=u.person_id WHERE u.tenant_id=${this.scope.tenantId} AND u.id=${accountId}`,
				)
			)[0]?.id ?? null
		)
	}

	/** Established assignments of a worker effective on a date. */
	currentAssignments(workerId: string, asOf: string): Promise<AssignmentFact[]> {
		return this.run(
			sql<AssignmentFact>`SELECT a.id,a.employment_id AS "employmentId",e.worker_id AS "workerId",a.organisation_id AS "organisationId",a.location_id AS "locationId",a.department_id AS "departmentId",a.designation_id AS "designationId",a.job_title AS "jobTitle",a.is_primary_assignment AS "isPrimary",a.full_time_equivalent::float8 AS "fullTimeEquivalent",to_char(a.effective_from,'YYYY-MM-DD') AS "effectiveFrom",to_char(a.effective_to,'YYYY-MM-DD') AS "effectiveTo",a.revision FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id WHERE a.tenant_id=${this.scope.tenantId} AND e.worker_id=${workerId} AND a.effective_period @> ${asOf}::date ORDER BY a.is_primary_assignment DESC,a.effective_from,a.id`,
		)
	}

	/** Select reporting edges with the named side's worker identity. */
	private edges(where: RawBuilder<unknown>, person: 'assignment' | 'manager', asOf: string) {
		const side = person === 'assignment' ? sql`rl.assignment_id` : sql`rl.manager_assignment_id`
		return this.run(
			sql<ReportingEdge>`SELECT rl.id AS "reportingLineId",rl.assignment_id AS "assignmentId",rl.manager_assignment_id AS "managerAssignmentId",w.id AS "workerId",p.display_name AS "displayName",w.worker_code AS "workerCode" FROM hcm.reporting_line rl JOIN hcm.assignment a ON a.tenant_id=rl.tenant_id AND a.id=${side} JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id WHERE rl.tenant_id=${this.scope.tenantId} AND rl.is_primary AND rl.effective_period @> ${asOf}::date AND a.effective_period @> ${asOf}::date AND ${where} ORDER BY p.display_name COLLATE "C",w.id COLLATE "C"`,
		)
	}

	/** The primary manager edge of an assignment; the edge's person is the manager. */
	async primaryManager(assignmentId: string, asOf: string): Promise<ReportingEdge | null> {
		return (await this.edges(sql`rl.assignment_id=${assignmentId}`, 'manager', asOf))[0] ?? null
	}

	/** Direct reports of the given manager assignments; each edge's person is the report. */
	directReports(managerAssignmentIds: readonly string[], asOf: string): Promise<ReportingEdge[]> {
		if (!managerAssignmentIds.length) return Promise.resolve([])
		return this.edges(
			sql`rl.manager_assignment_id = ANY(${[...managerAssignmentIds]}::text[])`,
			'assignment',
			asOf,
		)
	}

	/** Active people matching a normalized legal name and birth date, or a work email. */
	async duplicateCandidates(input: {
		givenName: string
		familyName: string
		birthDate: string | null
		workEmail: string | null
	}): Promise<DuplicateCandidate[]> {
		const found = new Map<string, DuplicateCandidate>()
		if (input.birthDate) {
			const wanted = matchName(input.givenName, input.familyName)
			const rows = await this.run(
				sql<{
					personId: string
					workerId: string | null
					displayName: string
					given: string
					family: string
				}>`SELECT p.id AS "personId",w.id AS "workerId",p.display_name AS "displayName",p.given_name AS given,p.family_name AS family FROM hcm.person p LEFT JOIN hcm.worker w ON w.tenant_id=p.tenant_id AND w.person_id=p.id WHERE p.tenant_id=${this.scope.tenantId} AND p.is_active AND p.birth_date=${input.birthDate}::date ORDER BY p.id LIMIT 500`,
			)
			for (const row of rows)
				if (matchName(row.given, row.family) === wanted)
					found.set(row.personId, {
						personId: row.personId,
						workerId: row.workerId,
						displayName: row.displayName,
						reason: 'name-and-birth-date',
					})
		}
		if (input.workEmail) {
			const rows = await this.run(
				sql<{
					personId: string
					workerId: string
					displayName: string
				}>`SELECT DISTINCT p.id AS "personId",w.id AS "workerId",p.display_name AS "displayName" FROM hcm.employment e JOIN hcm.worker w ON w.tenant_id=e.tenant_id AND w.id=e.worker_id JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id WHERE e.tenant_id=${this.scope.tenantId} AND p.is_active AND lower(e.work_email)=lower(${input.workEmail}) LIMIT 50`,
			)
			for (const row of rows)
				if (!found.has(row.personId)) found.set(row.personId, { ...row, reason: 'work-email' })
		}
		return [...found.values()]
	}
}

/** Bind both ports to a caller's open transaction; the handle is a Kysely transaction. */
export class KyselyWorkforcePortBinder extends WorkforcePortBinder {
	/** Return ports that run inside the given transaction as the given actor. */
	bind(
		transaction: unknown,
		actor: WorkforceActor,
	): { facts: WorkforceFactsPort; reads: WorkforceReadPort } {
		const scope: WorkforceScope = {
			executor: transaction as Kysely<unknown>,
			tenantId: actor.tenantId,
			accountId: actor.accountId,
		}
		return { facts: new KyselyWorkforceFacts(scope), reads: new KyselyWorkforceReads(scope) }
	}
}
