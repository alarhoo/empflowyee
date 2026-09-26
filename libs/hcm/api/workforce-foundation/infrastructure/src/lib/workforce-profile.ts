import { randomUUID } from 'node:crypto'
import { sql, type RawBuilder } from 'kysely'
import { HcmDomainError, invalidField } from '@empflowyee/hcm-runtime-contract'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import type {
	BloodGroup,
	ReferenceRow,
	RelationshipInput,
	Revisioned,
	SelfContactType,
	SelfProfileRow,
	WorkforceProfilePort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	personDisplayName,
	personSearchText,
	requireRevision,
} from '@empflowyee/hcm-api-workforce-foundation-domain'
import type { WorkforceScope } from './structure-repository'

/** Employments shown on a worker's own profile: everything not yet ended. */
const OWN_STATUSES = sql`('Pending','Active','OnNotice','Suspended')`

/** A worker's own profile facts and self-service person commands over PostgreSQL. */
export class KyselyWorkforceProfile implements WorkforceProfilePort {
	/** Bind to the caller's authorized transaction and actor. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures as domain errors. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** The worker's own facts on a date. */
	async selfProfile(workerId: string, asOf: string): Promise<SelfProfileRow | undefined> {
		const t = this.scope.tenantId
		const d = sql`${asOf}::date`
		/** Name of a referenced structure row. */
		const name = (table: string, alias: string, column: string) =>
			sql`(SELECT x.name FROM ${sql.table('hcm.' + table)} x WHERE x.tenant_id=${t} AND x.id=${sql.ref(alias + '.' + column)})`
		const unit = sql`coalesce((SELECT v.name FROM hcm.organisation_version v WHERE v.tenant_id=${t} AND v.organisation_id=a.organisation_id AND v.effective_period @> ${d}),(SELECT o.name FROM hcm.organisation o WHERE o.tenant_id=${t} AND o.id=a.organisation_id))`
		const assignments = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('assignmentId',a.id,'primary',coalesce(a.is_primary_assignment,false),
				'designation',${name('designation', 'a', 'designation_id')},'organisationUnit',${unit},'department',${name('department', 'a', 'department_id')},
				'location',${name('location', 'a', 'location_id')},'managerWorkerId',mw.id,'managerDisplayName',mp.display_name,'workMode',a.work_mode,
				'fullTimeEquivalent',a.full_time_equivalent::float8,'standardHoursPerWeek',a.standard_hours_per_week::float8,'costCentre',nullif(a.cost_center_code,''))
				ORDER BY a.is_primary_assignment DESC NULLS LAST,a.effective_from,a.id),'[]'::jsonb)
			FROM hcm.assignment a
			LEFT JOIN hcm.reporting_line r ON r.tenant_id=${t} AND r.assignment_id=a.id AND r.is_primary AND r.reporting_line_type='Solid' AND r.effective_period @> ${d}
			LEFT JOIN hcm.assignment ma ON ma.tenant_id=${t} AND ma.id=r.manager_assignment_id
			LEFT JOIN hcm.employment me ON me.tenant_id=${t} AND me.id=ma.employment_id
			LEFT JOIN hcm.worker mw ON mw.tenant_id=${t} AND mw.id=me.worker_id
			LEFT JOIN hcm.person mp ON mp.tenant_id=${t} AND mp.id=mw.person_id
			WHERE a.tenant_id=${t} AND a.employment_id=e.id AND a.effective_period @> ${d})`
		const employments = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('employmentId',e.id,'primary',coalesce(e.is_primary_employment,false),
				'legalEntity',${name('legal_entity', 'e', 'legal_entity_id')},'employmentType',e.employment_type,'employmentStatus',e.employment_status,
				'hireDate',to_char(e.hire_date,'YYYY-MM-DD'),'continuousServiceStartDate',to_char(e.continuous_service_start_date,'YYYY-MM-DD'),
				'probationStatus',e.probation_status,'probationEndDate',to_char(e.probation_end_date,'YYYY-MM-DD'),'noticePeriodDays',e.notice_period_days,
				'eligibleForRehire',e.is_eligible_for_rehire,'workEmail',e.work_email,'assignments',${assignments})
				ORDER BY e.is_primary_employment DESC NULLS LAST,e.hire_date,e.id),'[]'::jsonb)
			FROM hcm.employment e WHERE e.tenant_id=${t} AND e.worker_id=w.id AND e.employment_status IN ${OWN_STATUSES})`
		const contacts = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'type',c.contact_point_type,'value',c.value,'primary',c.is_primary,'verified',c.is_verified,'revision',c.revision)
				ORDER BY c.contact_point_type,c.is_primary DESC,c.created_at,c.id),'[]'::jsonb)
			FROM hcm.person_contact_point c WHERE c.tenant_id=${t} AND c.person_id=p.id AND c.is_active)`
		const addresses = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'type',x.address_type,'line1',x.address_line1,'line2',x.address_line2,'locality',x.locality,'city',x.city,
				'stateOrProvince',x.state_or_province,'postalCode',x.postal_code,'countryCode',x.country_code,'countryName',(SELECT k.name FROM hcm.country k WHERE k.code=x.country_code),
				'primary',x.is_primary,'effectiveFrom',to_char(x.effective_from,'YYYY-MM-DD'),'effectiveTo',to_char(x.effective_to,'YYYY-MM-DD'))
				ORDER BY x.is_primary DESC,x.address_type,x.id),'[]'::jsonb)
			FROM hcm.person_address x WHERE x.tenant_id=${t} AND x.person_id=p.id AND x.effective_period @> ${d})`
		const relationships = sql`(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'relationshipType',r.relationship_type_code,'relationshipName',rt.name,'fullName',coalesce(rp.display_name,r.full_name),
				'birthDate',to_char(r.birth_date,'YYYY-MM-DD'),'genderCode',r.gender_code,'contactNumber',r.contact_number,'dependent',r.is_dependent,
				'emergencyContact',r.is_emergency_contact,'emergencyPriority',r.emergency_contact_priority,'revision',r.revision)
				ORDER BY r.emergency_contact_priority NULLS LAST,rt.sort_order,r.full_name,r.id),'[]'::jsonb)
			FROM hcm.person_relationship r JOIN hcm.relationship_type rt ON rt.code=r.relationship_type_code
			LEFT JOIN hcm.person rp ON rp.tenant_id=${t} AND rp.id=r.related_person_id
			WHERE r.tenant_id=${t} AND r.person_id=p.id AND r.is_active)`
		const rows = await this.run(
			sql<SelfProfileRow>`SELECT p.id AS "personId",w.id AS "workerId",p.revision AS "personRevision",p.display_name AS "displayName",p.given_name AS "givenName",
				p.middle_name AS "middleName",p.family_name AS "familyName",p.preferred_name AS "preferredName",p.former_name AS "formerName",
				to_char(p.birth_date,'YYYY-MM-DD') AS "birthDate",(SELECT g.name FROM hcm.gender g WHERE g.code=p.gender_code) AS gender,
				(SELECT m.name FROM hcm.marital_status m WHERE m.code=p.marital_status_code) AS "maritalStatus",
				(SELECT k.name FROM hcm.country k WHERE k.code=p.nationality_country_code) AS nationality,p.blood_group AS "bloodGroup",
				w.worker_code AS "workerCode",(SELECT wt.name FROM hcm.worker_type wt WHERE wt.tenant_id=${t} AND wt.id=w.worker_type_id) AS "workerType",
				${contacts} AS "contactPoints",${addresses} AS addresses,${relationships} AS relationships,${employments} AS employments
			FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
			WHERE w.tenant_id=${t} AND w.id=${workerId} AND p.is_active`,
		)
		return rows[0]
	}

	/** Active product reference rows. */
	async references(kind: 'relationship-types' | 'genders'): Promise<ReferenceRow[]> {
		if (kind === 'genders')
			return this.run(
				sql<ReferenceRow>`SELECT code,name FROM hcm.gender WHERE active ORDER BY sort_order,code`,
			)
		return this.run(
			sql<ReferenceRow>`SELECT code,name,is_eligible_as_dependent AS "dependentEligible" FROM hcm.relationship_type WHERE active ORDER BY sort_order,code`,
		)
	}

	/** Lock the active person and check the expected revision. */
	private async lockPerson(personId: string, expectedRevision: number) {
		const [row] = await this.run(
			sql<{
				revision: number
				givenName: string
				familyName: string
			}>`SELECT revision,given_name AS "givenName",family_name AS "familyName" FROM hcm.person WHERE tenant_id=${this.scope.tenantId} AND id=${personId} AND is_active FOR UPDATE`,
		)
		if (!row) throw new HcmDomainError('not-found')
		requireRevision(row.revision, expectedRevision)
		return row
	}

	/** Change the preferred name and blood group; display name and search text follow. */
	async updateSelfFacts(
		personId: string,
		expectedRevision: number,
		facts: { preferredName: string; bloodGroup: BloodGroup | null },
	): Promise<Revisioned> {
		const person = await this.lockPerson(personId, expectedRevision)
		const preferred = facts.preferredName.trim()
		await this.run(
			sql`UPDATE hcm.person SET preferred_name=${preferred},blood_group=${facts.bloodGroup},display_name=${personDisplayName(person.givenName, preferred, person.familyName)},search_text=${personSearchText(person.givenName, preferred, person.familyName)},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${personId}`,
		)
		return { id: personId, revision: person.revision + 1 }
	}

	/** Add an unverified contact point; the first active one of its type becomes primary. */
	async addContactPoint(
		personId: string,
		type: SelfContactType,
		value: string,
	): Promise<Revisioned> {
		const t = this.scope.tenantId
		const [count] = await this.run(
			sql<{
				total: number
				primary: number
			}>`SELECT count(*)::int AS total,count(*) FILTER (WHERE is_primary)::int AS primary FROM hcm.person_contact_point WHERE tenant_id=${t} AND person_id=${personId} AND contact_point_type=${type} AND is_active`,
		)
		if ((count?.total ?? 0) >= 5) invalidField('value', 'too-many')
		const id = `${personId}/contact-point/${randomUUID()}`
		const a = this.scope.accountId
		await this.run(
			sql`INSERT INTO hcm.person_contact_point(tenant_id,id,person_id,contact_point_type,value,is_primary,is_active,created_by_account_id,updated_by_account_id) VALUES(${t},${id},${personId},${type},${value.trim()},${!count?.primary},true,${a},${a})`,
		)
		return { id, revision: 1 }
	}

	/** Lock one active self-service contact point of the person. */
	private async lockContact(personId: string, id: string, expectedRevision: number) {
		const [row] = await this.run(
			sql<{
				revision: number
				type: string
				primary: boolean
			}>`SELECT revision,contact_point_type AS type,is_primary AS primary FROM hcm.person_contact_point WHERE tenant_id=${this.scope.tenantId} AND id=${id} AND person_id=${personId} AND is_active AND contact_point_type IN ('PersonalEmail','MobilePhone') FOR UPDATE`,
		)
		if (!row) throw new HcmDomainError('not-found')
		requireRevision(row.revision, expectedRevision)
		return row
	}

	/** Change a contact point's value or make it the primary of its type. */
	async updateContactPoint(
		personId: string,
		id: string,
		expectedRevision: number,
		change: { value: string; primary: boolean },
	): Promise<Revisioned> {
		const row = await this.lockContact(personId, id, expectedRevision)
		const t = this.scope.tenantId
		const a = this.scope.accountId
		if (row.primary && !change.primary) invalidField('primary', 'primary-required')
		if (change.primary && !row.primary)
			await this.run(
				sql`UPDATE hcm.person_contact_point SET is_primary=false,revision=revision+1,updated_at=now(),updated_by_account_id=${a} WHERE tenant_id=${t} AND person_id=${personId} AND contact_point_type=${row.type} AND is_primary AND is_active`,
			)
		await this.run(
			sql`UPDATE hcm.person_contact_point SET value=${change.value.trim()},is_primary=${change.primary},revision=revision+1,updated_at=now(),updated_by_account_id=${a} WHERE tenant_id=${t} AND id=${id}`,
		)
		return { id, revision: row.revision + 1 }
	}

	/** Deactivate a contact point; the oldest remaining one of its type becomes primary. */
	async deactivateContactPoint(
		personId: string,
		id: string,
		expectedRevision: number,
	): Promise<Revisioned> {
		const row = await this.lockContact(personId, id, expectedRevision)
		const t = this.scope.tenantId
		const a = this.scope.accountId
		await this.run(
			sql`UPDATE hcm.person_contact_point SET is_active=false,is_primary=false,revision=revision+1,updated_at=now(),updated_by_account_id=${a} WHERE tenant_id=${t} AND id=${id}`,
		)
		if (row.primary)
			await this.run(
				sql`UPDATE hcm.person_contact_point SET is_primary=true,revision=revision+1,updated_at=now(),updated_by_account_id=${a} WHERE tenant_id=${t} AND id=(SELECT id FROM hcm.person_contact_point WHERE tenant_id=${t} AND person_id=${personId} AND contact_point_type=${row.type} AND is_active ORDER BY created_at,id LIMIT 1)`,
			)
		return { id, revision: row.revision + 1 }
	}

	/** Check relationship rules the schema cannot express with a field error. */
	private async requireRelationship(
		personId: string,
		input: RelationshipInput,
		exceptId: string | null,
	): Promise<void> {
		if (!input.fullName.trim()) invalidField('fullName', 'required')
		const [type] = await this.run(
			sql<{
				dependent: boolean
			}>`SELECT is_eligible_as_dependent AS dependent FROM hcm.relationship_type WHERE code=${input.relationshipType} AND active`,
		)
		if (!type) invalidField('relationshipType', 'unknown')
		if (input.dependent && !type?.dependent) invalidField('dependent', 'not-eligible')
		if (input.genderCode) {
			const [gender] = await this.run(
				sql<{ code: string }>`SELECT code FROM hcm.gender WHERE code=${input.genderCode} AND active`,
			)
			if (!gender) invalidField('genderCode', 'unknown')
		}
		if (input.emergencyContact) {
			const [taken] = await this.run(
				sql<{
					id: string
				}>`SELECT id FROM hcm.person_relationship WHERE tenant_id=${this.scope.tenantId} AND person_id=${personId} AND is_active AND is_emergency_contact AND emergency_contact_priority=${input.emergencyPriority} AND id IS DISTINCT FROM ${exceptId}`,
			)
			if (taken) invalidField('emergencyPriority', 'duplicate')
		}
		const [count] = await this.run(
			sql<{
				total: number
			}>`SELECT count(*)::int AS total FROM hcm.person_relationship WHERE tenant_id=${this.scope.tenantId} AND person_id=${personId} AND is_active AND id IS DISTINCT FROM ${exceptId}`,
		)
		if ((count?.total ?? 0) >= 20) invalidField('fullName', 'too-many')
	}

	/** Add an emergency contact or family member. */
	async addRelationship(personId: string, input: RelationshipInput): Promise<Revisioned> {
		await this.requireRelationship(personId, input, null)
		const id = `${personId}/relationship/${randomUUID()}`
		const a = this.scope.accountId
		const priority = input.emergencyContact ? input.emergencyPriority : null
		await this.run(
			sql`INSERT INTO hcm.person_relationship(tenant_id,id,person_id,relationship_type_code,full_name,birth_date,gender_code,contact_number,is_dependent,is_emergency_contact,emergency_contact_priority,is_active,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${id},${personId},${input.relationshipType},${input.fullName.trim()},${input.birthDate},${input.genderCode},${input.contactNumber.trim()},${input.dependent},${input.emergencyContact},${priority},true,${a},${a})`,
		)
		return { id, revision: 1 }
	}

	/** Lock one active relationship of the person. */
	private async lockRelationship(personId: string, id: string, expectedRevision: number) {
		const [row] = await this.run(
			sql<{
				revision: number
			}>`SELECT revision FROM hcm.person_relationship WHERE tenant_id=${this.scope.tenantId} AND id=${id} AND person_id=${personId} AND is_active FOR UPDATE`,
		)
		if (!row) throw new HcmDomainError('not-found')
		requireRevision(row.revision, expectedRevision)
		return row
	}

	/** Change an emergency contact or family member. */
	async updateRelationship(
		personId: string,
		id: string,
		expectedRevision: number,
		input: RelationshipInput,
	): Promise<Revisioned> {
		const row = await this.lockRelationship(personId, id, expectedRevision)
		await this.requireRelationship(personId, input, id)
		const priority = input.emergencyContact ? input.emergencyPriority : null
		await this.run(
			sql`UPDATE hcm.person_relationship SET relationship_type_code=${input.relationshipType},full_name=${input.fullName.trim()},birth_date=${input.birthDate},gender_code=${input.genderCode},contact_number=${input.contactNumber.trim()},is_dependent=${input.dependent},is_emergency_contact=${input.emergencyContact},emergency_contact_priority=${priority},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
		return { id, revision: row.revision + 1 }
	}

	/** Deactivate an emergency contact or family member. */
	async deactivateRelationship(
		personId: string,
		id: string,
		expectedRevision: number,
	): Promise<Revisioned> {
		const row = await this.lockRelationship(personId, id, expectedRevision)
		await this.run(
			sql`UPDATE hcm.person_relationship SET is_active=false,revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
		return { id, revision: row.revision + 1 }
	}
}
