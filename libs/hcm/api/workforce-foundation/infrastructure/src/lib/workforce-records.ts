import { randomUUID } from 'node:crypto'
import { sql, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
	likePattern,
	prefixPattern,
} from '@empflowyee/hcm-api-database-kysely'
import { HcmDomainError, invalidField, type HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	AddressInput,
	NamedRef,
	RecordFilter,
	RecordRow,
	RecordSummaryRow,
	Revisioned,
	WorkerEventRow,
	WorkerLock,
	WorkforceRecordsPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { personSearchText } from '@empflowyee/hcm-api-workforce-foundation-domain'
import type { WorkforceScope } from './structure-repository'

/** An ISO date column. */
const date = (column: string) => sql`to_char(${sql.ref(column)},'YYYY-MM-DD')`
/** The deepest merge chain followed to a survivor. */
const MAX_MERGE_DEPTH = 10

/** HR worker records and address corrections in the caller's authorized transaction. */
export class KyselyWorkforceRecords implements WorkforceRecordsPort {
	/** Bind to the authorized tenant transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Whether a worker's record lacks established facts: no employment, or a minimal spine row. */
	private incomplete(worker: string): RawBuilder<unknown> {
		const t = this.scope.tenantId
		return sql`(NOT EXISTS (SELECT 1 FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=${sql.ref(worker)})
			OR EXISTS (SELECT 1 FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=${sql.ref(worker)} AND e.employment_status IS NULL)
			OR EXISTS (SELECT 1 FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
				WHERE a.tenant_id=${t} AND e.worker_id=${sql.ref(worker)} AND a.effective_from IS NULL))`
	}

	/** Workers with their primary employment and the assignment shown on a date. */
	private summaries(asOf: string): RawBuilder<unknown> {
		const t = this.scope.tenantId
		const d = sql`${asOf}::date`
		return sql`SELECT w.id AS "workerId",p.id AS "personId",p.display_name AS "displayName",w.worker_code AS "workerNumber",
				p.search_text,w.worker_type_id,pe.legal_entity_id,pa.organisation_id,pa.department_id,pa.location_id,
				(SELECT x.name FROM hcm.designation x WHERE x.tenant_id=${t} AND x.id=pa.designation_id) AS designation,
				coalesce((SELECT v.name FROM hcm.organisation_version v WHERE v.tenant_id=${t} AND v.organisation_id=pa.organisation_id AND v.effective_period @> ${d}),
					(SELECT o.name FROM hcm.organisation o WHERE o.tenant_id=${t} AND o.id=pa.organisation_id)) AS unit,
				pe.employment_status AS "employmentStatus",
				CASE WHEN ${this.incomplete('w.id')} THEN 'Incomplete' ELSE 'Complete' END AS "recordState"
			FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
			LEFT JOIN LATERAL (SELECT e.* FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=w.id
				ORDER BY e.is_primary_employment DESC NULLS LAST,e.hire_date DESC NULLS LAST,e.id LIMIT 1) pe ON true
			LEFT JOIN LATERAL (SELECT a.* FROM hcm.assignment a WHERE a.tenant_id=${t} AND a.employment_id=pe.id
				ORDER BY (a.effective_period @> ${d}) DESC NULLS LAST,a.is_primary_assignment DESC NULLS LAST,a.effective_from DESC NULLS LAST,a.id LIMIT 1) pa ON true
			WHERE w.tenant_id=${t} AND p.is_active`
	}

	/** Workers by name or number then id. */
	async records(
		filter: RecordFilter,
		page: { limit: number; cursor?: string },
		asOf: string,
	): Promise<HcmPage<RecordSummaryRow>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, this.scope.accountId, 'records', asOf, filter])
		const after = decodeCursor(page.cursor, key, 2)
		const order =
			filter.sort === 'workerNumber' ? sql.ref('r.workerNumber') : sql.ref('r.displayName')
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (filter.q) {
			const email = sql`EXISTS (SELECT 1 FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=r."workerId" AND lower(e.work_email) LIKE ${prefixPattern(filter.q.toLowerCase())})`
			where.push(
				sql`(r.search_text LIKE ${likePattern(personSearchText(filter.q))} OR lower(r."workerNumber") LIKE ${prefixPattern(filter.q.toLowerCase())} OR ${email})`,
			)
		}
		if (filter.status) where.push(sql`r."employmentStatus"=${filter.status}`)
		if (filter.legalEntityId) where.push(sql`r.legal_entity_id=${filter.legalEntityId}`)
		if (filter.unitId) where.push(sql`r.organisation_id=${filter.unitId}`)
		if (filter.departmentId) where.push(sql`r.department_id=${filter.departmentId}`)
		if (filter.locationId) where.push(sql`r.location_id=${filter.locationId}`)
		if (filter.workerTypeId) where.push(sql`r.worker_type_id=${filter.workerTypeId}`)
		if (filter.recordState) where.push(sql`r."recordState"=${filter.recordState}`)
		if (after)
			where.push(
				sql`(${order} COLLATE "C",r."workerId" COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")`,
			)
		const rows = await this.run(
			sql<RecordSummaryRow>`SELECT r."workerId",r."personId",r."displayName",r."workerNumber",r.designation,r.unit,r."employmentStatus",r."recordState"
				FROM (${this.summaries(asOf)}) r WHERE ${sql.join(where, sql` AND `)}
				ORDER BY ${order} COLLATE "C",r."workerId" COLLATE "C" LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last worker. */ (row) => [
				filter.sort === 'workerNumber' ? row.workerNumber : row.displayName,
				row.workerId,
			],
		)
	}

	/** The worker of the survivor a merged person points to, or the worker itself. */
	private async survivor(workerId: string): Promise<string | undefined> {
		const t = this.scope.tenantId
		const [row] = await this.run(
			sql<{ workerId: string }>`WITH RECURSIVE chain(person_id,depth) AS (
				SELECT w.person_id,0 FROM hcm.worker w WHERE w.tenant_id=${t} AND w.id=${workerId}
				UNION ALL
				SELECT p.merged_into_person_id,c.depth+1 FROM chain c JOIN hcm.person p ON p.tenant_id=${t} AND p.id=c.person_id
				WHERE p.merged_into_person_id IS NOT NULL AND c.depth < ${MAX_MERGE_DEPTH})
				SELECT w.id AS "workerId" FROM chain c JOIN hcm.person p ON p.tenant_id=${t} AND p.id=c.person_id AND p.is_active
				JOIN hcm.worker w ON w.tenant_id=${t} AND w.person_id=p.id ORDER BY c.depth DESC LIMIT 1`,
		)
		return row?.workerId
	}

	/** One worker's complete record, following a merge to the survivor. */
	async record(workerId: string, asOf: string): Promise<RecordRow | undefined> {
		const id = await this.survivor(workerId)
		if (!id) return undefined
		const t = this.scope.tenantId
		const d = sql`${asOf}::date`
		/** Name of a referenced structure row. */
		const name = (table: string, column: string) =>
			sql`(SELECT x.name FROM ${sql.table('hcm.' + table)} x WHERE x.tenant_id=${t} AND x.id=${sql.ref(column)})`
		const contacts = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'type',c.contact_point_type,'value',c.value,'primary',c.is_primary,'verified',c.is_verified,'revision',c.revision)
				ORDER BY c.contact_point_type,c.is_primary DESC,c.created_at,c.id),'[]'::jsonb)
			FROM hcm.person_contact_point c WHERE c.tenant_id=${t} AND c.person_id=p.id AND c.is_active)`
		const addresses = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'type',x.address_type,'line1',x.address_line1,'line2',x.address_line2,'locality',x.locality,'city',x.city,
				'stateOrProvince',x.state_or_province,'postalCode',x.postal_code,'countryCode',x.country_code,'countryName',(SELECT k.name FROM hcm.country k WHERE k.code=x.country_code),
				'primary',x.is_primary,'effectiveFrom',${date('x.effective_from')},'effectiveTo',${date('x.effective_to')},'revision',x.revision)
				ORDER BY x.effective_to IS NOT NULL,x.is_primary DESC,x.address_type,x.effective_from DESC,x.id),'[]'::jsonb)
			FROM hcm.person_address x WHERE x.tenant_id=${t} AND x.person_id=p.id)`
		const relationships = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'relationshipType',r.relationship_type_code,'relationshipName',rt.name,'fullName',coalesce(rp.display_name,r.full_name),
				'birthDate',${date('r.birth_date')},'genderCode',r.gender_code,'contactNumber',r.contact_number,'dependent',r.is_dependent,
				'emergencyContact',r.is_emergency_contact,'emergencyPriority',r.emergency_contact_priority,'revision',r.revision)
				ORDER BY r.emergency_contact_priority NULLS LAST,rt.sort_order,r.full_name,r.id),'[]'::jsonb)
			FROM hcm.person_relationship r JOIN hcm.relationship_type rt ON rt.code=r.relationship_type_code
			LEFT JOIN hcm.person rp ON rp.tenant_id=${t} AND rp.id=r.related_person_id
			WHERE r.tenant_id=${t} AND r.person_id=p.id AND r.is_active)`
		const employments = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('employmentId',e.id,'primary',coalesce(e.is_primary_employment,false),
				'legalEntity',CASE WHEN e.legal_entity_id IS NULL THEN NULL ELSE jsonb_build_object('id',e.legal_entity_id,'name',${name('legal_entity', 'e.legal_entity_id')}) END,
				'employmentType',e.employment_type,'employmentStatus',e.employment_status,'hireDate',${date('e.hire_date')},'endDate',${date('e.employment_end_date')},
				'workEmail',e.work_email,'probationStatus',e.probation_status,'probationEndDate',${date('e.probation_end_date')},'noticePeriodDays',e.notice_period_days,
				'eligibleForRehire',e.is_eligible_for_rehire) ORDER BY e.is_primary_employment DESC NULLS LAST,e.hire_date DESC NULLS LAST,e.id),'[]'::jsonb)
			FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=w.id)`
		const assignments = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('assignmentId',a.id,'employmentId',a.employment_id,'primary',coalesce(a.is_primary_assignment,false),
				'jobTitle',a.job_title,'designation',${name('designation', 'a.designation_id')},
				'unit',coalesce((SELECT v.name FROM hcm.organisation_version v WHERE v.tenant_id=${t} AND v.organisation_id=a.organisation_id AND v.effective_period @> coalesce(a.effective_from,${d})),${name('organisation', 'a.organisation_id')}),
				'department',${name('department', 'a.department_id')},'location',${name('location', 'a.location_id')},
				'position',(SELECT jsonb_build_object('id',x.id,'code',x.code,'name',x.name) FROM hcm.position x WHERE x.tenant_id=${t} AND x.id=a.position_id),
				'workMode',a.work_mode,'fullTimeEquivalent',a.full_time_equivalent::float8,'standardHoursPerWeek',a.standard_hours_per_week::float8,
				'costCentre',nullif(a.cost_center_code,''),'effectiveFrom',${date('a.effective_from')},'effectiveTo',${date('a.effective_to')})
				ORDER BY a.effective_from DESC NULLS LAST,a.id),'[]'::jsonb)
			FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id WHERE a.tenant_id=${t} AND e.worker_id=w.id)`
		const reporting = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('reportingLineId',r.id,'assignmentId',r.assignment_id,'managerWorkerId',mw.id,'managerName',mp.display_name,
				'type',r.reporting_line_type,'primary',r.is_primary,'effectiveFrom',${date('r.effective_from')},'effectiveTo',${date('r.effective_to')})
				ORDER BY r.effective_from DESC,r.id),'[]'::jsonb)
			FROM hcm.reporting_line r JOIN hcm.assignment a ON a.tenant_id=r.tenant_id AND a.id=r.assignment_id
			JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
			JOIN hcm.assignment ma ON ma.tenant_id=r.tenant_id AND ma.id=r.manager_assignment_id
			JOIN hcm.employment me ON me.tenant_id=ma.tenant_id AND me.id=ma.employment_id
			JOIN hcm.worker mw ON mw.tenant_id=me.tenant_id AND mw.id=me.worker_id
			JOIN hcm.person mp ON mp.tenant_id=mw.tenant_id AND mp.id=mw.person_id
			WHERE r.tenant_id=${t} AND e.worker_id=w.id)`
		const reports = sql`(SELECT count(DISTINCT r.assignment_id)::int FROM hcm.reporting_line r
			JOIN hcm.assignment ma ON ma.tenant_id=r.tenant_id AND ma.id=r.manager_assignment_id
			JOIN hcm.employment me ON me.tenant_id=ma.tenant_id AND me.id=ma.employment_id
			WHERE r.tenant_id=${t} AND me.worker_id=w.id AND r.is_primary AND r.reporting_line_type='Solid' AND r.effective_period @> ${d})`
		const [row] = await this.run(
			sql<RecordRow>`SELECT w.id AS "workerId",p.id AS "personId",p.revision AS "personRevision",w.worker_code AS "workerNumber",
				(SELECT jsonb_build_object('id',wt.id,'name',wt.name) FROM hcm.worker_type wt WHERE wt.tenant_id=${t} AND wt.id=w.worker_type_id) AS "workerType",
				p.display_name AS "displayName",p.given_name AS "givenName",p.middle_name AS "middleName",p.family_name AS "familyName",
				p.preferred_name AS "preferredName",p.former_name AS "formerName",${date('p.birth_date')} AS "birthDate",
				p.gender_code AS "genderCode",(SELECT g.name FROM hcm.gender g WHERE g.code=p.gender_code) AS gender,
				p.marital_status_code AS "maritalStatusCode",(SELECT m.name FROM hcm.marital_status m WHERE m.code=p.marital_status_code) AS "maritalStatus",
				p.nationality_country_code AS "nationalityCode",(SELECT k.name FROM hcm.country k WHERE k.code=p.nationality_country_code) AS nationality,
				CASE WHEN ${this.incomplete('w.id')} THEN 'Incomplete' ELSE 'Complete' END AS "recordState",
				${contacts} AS "contactPoints",${addresses} AS addresses,${relationships} AS relationships,${employments} AS employments,
				${assignments} AS assignments,${reporting} AS reporting,${reports} AS "directReportCount"
			FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
			WHERE w.tenant_id=${t} AND w.id=${id}`,
		)
		return row
	}

	/** Worker events, newest first. */
	async events(
		workerId: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<WorkerEventRow>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, 'events', workerId])
		const after = decodeCursor(page.cursor, key, 3)
		const rows = await this.run(
			sql<
				WorkerEventRow & { at: string }
			>`SELECT v.id,et.name AS "eventType",et.code AS "eventTypeCode",${date('v.effective_date')} AS "effectiveDate",
				to_char(v.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "recordedAt",v.recorded_at::text AS at,
				v.reason,v.previous_value_summary AS "previousValueSummary",v.new_value_summary AS "newValueSummary"
				FROM hcm.worker_event v JOIN hcm.worker_event_type et ON et.tenant_id=v.tenant_id AND et.id=v.worker_event_type_id
				WHERE v.tenant_id=${t} AND v.worker_id=${workerId}
				${after ? sql`AND (v.effective_date,v.recorded_at,v.id) < (${after[0]}::date,${after[1]}::timestamptz,${after[2]})` : sql``}
				ORDER BY v.effective_date DESC,v.recorded_at DESC,v.id DESC LIMIT ${page.limit + 1}`,
		)
		const result = keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last event. */ (row) => [row.effectiveDate, row.at, row.id],
		)
		return {
			items: result.items.map(/** Drop the cursor column. */ ({ at: _at, ...row }) => row),
			nextCursor: result.nextCursor,
		}
	}

	/** Lock a worker and its person. */
	async lockWorker(workerId: string): Promise<WorkerLock | undefined> {
		const t = this.scope.tenantId
		const [row] = await this.run(
			sql<
				Omit<WorkerLock, 'mergedIntoWorkerId'> & { merged: boolean }
			>`SELECT w.id AS "workerId",p.id AS "personId",p.revision AS "personRevision",p.merged_into_person_id IS NOT NULL AS merged,
				EXISTS (SELECT 1 FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=w.id AND e.employment_status IS NOT NULL) AS established
				FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
				WHERE w.tenant_id=${t} AND w.id=${workerId} FOR UPDATE OF w,p`,
		)
		if (!row) return undefined
		const { merged, ...lock } = row
		return {
			...lock,
			mergedIntoWorkerId: merged ? ((await this.survivor(workerId)) ?? null) : null,
		}
	}

	/** The blood group, read only for an emergency reveal. */
	async bloodGroup(personId: string): Promise<string | null> {
		const [row] = await this.run(
			sql<{
				value: string | null
			}>`SELECT blood_group AS value FROM hcm.person WHERE tenant_id=${this.scope.tenantId} AND id=${personId}`,
		)
		return row?.value ?? null
	}

	/** Active worker types. */
	workerTypes(): Promise<NamedRef[]> {
		return this.run(
			sql<NamedRef>`SELECT id,name FROM hcm.worker_type WHERE tenant_id=${this.scope.tenantId} AND is_active ORDER BY sort_order,name`,
		)
	}

	/** Add an address; a new primary address closes the overlapping primary one the day before. */
	async addAddress(personId: string, input: AddressInput): Promise<Revisioned> {
		const { tenantId: t, accountId: a } = this.scope
		if (input.primary) {
			const current = await this.run(
				sql<{
					id: string
					from: string
				}>`SELECT id,${date('effective_from')} AS from FROM hcm.person_address
					WHERE tenant_id=${t} AND person_id=${personId} AND is_primary
						AND effective_period && daterange(${input.effectiveFrom}::date,NULL,'[)') FOR UPDATE`,
			)
			for (const row of current) {
				if (row.from >= input.effectiveFrom) invalidField('primary', 'overlap')
				await this.run(
					sql`UPDATE hcm.person_address SET effective_to=${input.effectiveFrom}::date - 1,revision=revision+1,updated_at=now(),updated_by_account_id=${a}
						WHERE tenant_id=${t} AND id=${row.id}`,
				)
			}
		}
		const id = `${personId}/address/${randomUUID()}`
		await this.run(
			sql`INSERT INTO hcm.person_address(tenant_id,id,person_id,address_type,address_line1,address_line2,locality,city,state_or_province,postal_code,
				country_code,is_primary,effective_from,created_by_account_id,updated_by_account_id)
				VALUES (${t},${id},${personId},${input.type},${input.line1},${input.line2},${input.locality},${input.city},${input.stateOrProvince},
				${input.postalCode},${input.countryCode},${input.primary},${input.effectiveFrom},${a},${a})`,
		)
		return { id, revision: 1 }
	}

	/** Lock one address of the person and check its revision. */
	private async lockAddress(personId: string, id: string, expectedRevision: number) {
		const [row] = await this.run(
			sql<{
				revision: number
				from: string
				to: string | null
			}>`SELECT revision,${date('effective_from')} AS from,${date('effective_to')} AS to FROM hcm.person_address
				WHERE tenant_id=${this.scope.tenantId} AND id=${id} AND person_id=${personId} FOR UPDATE`,
		)
		if (!row) throw new HcmDomainError('not-found')
		if (row.revision !== expectedRevision) throw new HcmDomainError('revision-conflict')
		if (row.to !== null) throw new HcmDomainError('invalid-state')
		return row
	}

	/** Close an address the day before the correction and add the successor. */
	async replaceAddress(
		personId: string,
		id: string,
		expectedRevision: number,
		input: AddressInput,
	): Promise<Revisioned> {
		const row = await this.lockAddress(personId, id, expectedRevision)
		if (input.effectiveFrom <= row.from) invalidField('effectiveFrom', 'not-after-current')
		await this.run(
			sql`UPDATE hcm.person_address SET effective_to=${input.effectiveFrom}::date - 1,revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId}
				WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
		return this.addAddress(personId, input)
	}

	/** End an address on a date. */
	async endAddress(
		personId: string,
		id: string,
		expectedRevision: number,
		effectiveTo: string,
	): Promise<Revisioned> {
		const row = await this.lockAddress(personId, id, expectedRevision)
		if (effectiveTo < row.from) invalidField('effectiveTo', 'before-start')
		await this.run(
			sql`UPDATE hcm.person_address SET effective_to=${effectiveTo},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId}
				WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
		return { id, revision: row.revision + 1 }
	}
}
