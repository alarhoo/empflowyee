import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
} from '@empflowyee/hcm-api-database-kysely'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	ImportColumnInput,
	MatchStatus,
	RowStatus,
	RunStatus,
	TemplateStatus,
} from '@empflowyee/hcm-employee-contract'
import type {
	EmployeeImportRepository,
	ImportColumnRow,
	ImportIssueRow,
	ImportRowRow,
	ImportRunRow,
	ImportTemplateRow,
	NewImportRow,
	RunPatch,
} from '@empflowyee/hcm-api-employee-application'

interface Scope {
	executor: Kysely<unknown>
	tenantId: string
	accountId: string
}

/** A timestamp column as an ISO string. */
const stamp = (column: string) =>
	sql`to_char(${sql.ref(column)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/** A timestamp column as a sortable cursor key. */
const sortKey = (column: string) =>
	sql`to_char(${sql.ref(column)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')`

/** Employee-owned import templates, runs, rows and issues in the caller's transaction. */
export class KyselyEmployeeImportRepository implements EmployeeImportRepository {
	/** Bind to the authorized tenant transaction. */
	constructor(private readonly scope: Scope) {}

	/** Execute one query and classify integrity failures safely. */
	private async exec<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Template columns with their column count. */
	private templateSelect(): RawBuilder<unknown> {
		return sql`SELECT t.id,t.code,t.version_number AS "versionNumber",t.name,t.description,t.file_format AS "fileFormat",
				t.status,t.has_header_row AS "hasHeaderRow",t.date_format AS "dateFormat",t.time_zone AS "timeZone",
				(SELECT count(*)::int FROM hcm.employee_import_template_column c WHERE c.tenant_id=t.tenant_id AND c.template_id=t.id) AS "columnCount",
				${stamp('t.published_at')} AS "publishedAt",${stamp('t.updated_at')} AS "updatedAt",t.revision,
				${sortKey('t.updated_at')} AS "sortKey"
			FROM hcm.employee_import_template t`
	}

	/** Drop the cursor key from a template row. */
	private template_(raw: Record<string, unknown>): ImportTemplateRow {
		const { sortKey: key, ...row } = raw
		void key
		return row as unknown as ImportTemplateRow
	}

	/** A page of templates, most recently changed first. */
	async templates(query: {
		limit: number
		cursor?: string
		status?: TemplateStatus
	}): Promise<HcmPage<ImportTemplateRow>> {
		const key = cursorBinding([this.scope.tenantId, 'import-templates', query.status ?? null])
		const after = decodeCursor(query.cursor, key, 2)
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (query.status) where.push(sql`x.status=${query.status}`)
		if (after)
			where.push(sql`(x."sortKey",x.id COLLATE "C") < (${after[0]},${after[1]} COLLATE "C")`)
		const rows = await this.exec(
			sql<
				Record<string, unknown>
			>`SELECT x.* FROM (${this.templateSelect()} WHERE t.tenant_id=${this.scope.tenantId}) x
				WHERE ${sql.join(where, sql` AND `)} ORDER BY x."sortKey" DESC,x.id COLLATE "C" DESC LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last template. */ (row) => [
				row['sortKey'] as string,
				row['id'] as string,
			],
		)
		return {
			items: page.items.map(/** Row. */ (row) => this.template_(row)),
			nextCursor: page.nextCursor,
		}
	}

	/** One template, optionally locked. */
	async template(id: string, lock = false): Promise<ImportTemplateRow | undefined> {
		if (lock)
			await this.exec(
				sql`SELECT 1 FROM hcm.employee_import_template WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		const [row] = await this.exec(
			sql<
				Record<string, unknown>
			>`${this.templateSelect()} WHERE t.tenant_id=${this.scope.tenantId} AND t.id=${id}`,
		)
		return row ? this.template_(row) : undefined
	}

	/** A template's columns in display order. */
	columns(templateId: string): Promise<ImportColumnRow[]> {
		return this.exec(
			sql<ImportColumnRow>`SELECT id,source_column_name AS "sourceColumnName",source_column_ordinal AS "sourceColumnOrdinal",
				standard_field_code AS "fieldCode",transformation_code AS "transformationCode",is_match_key AS "isMatchKey",sort_order AS "sortOrder"
				FROM hcm.employee_import_template_column WHERE tenant_id=${this.scope.tenantId} AND template_id=${templateId}
				ORDER BY sort_order,source_column_ordinal`,
		)
	}

	/** The next version number of a code, whether a draft exists, and its latest version. */
	async versions(code: string): Promise<{ next: number; draft: boolean; latestId: string | null }> {
		const [row] = await this.exec(
			sql<{
				next: number
				draft: boolean
				latestId: string | null
			}>`SELECT coalesce(max(version_number),0)+1 AS next,
				bool_or(status='Draft') IS TRUE AS draft,
				(array_agg(id ORDER BY version_number DESC))[1] AS "latestId"
				FROM hcm.employee_import_template WHERE tenant_id=${this.scope.tenantId} AND code=${code}`,
		)
		return row ?? { next: 1, draft: false, latestId: null }
	}

	/** Insert a draft template version. */
	async insertTemplate(
		input: Parameters<EmployeeImportRepository['insertTemplate']>[0],
	): Promise<string> {
		const id = randomUUID()
		const { tenantId, accountId } = this.scope
		await this.exec(
			sql`INSERT INTO hcm.employee_import_template (tenant_id,id,code,version_number,name,description,file_format,has_header_row,
				date_format,time_zone,supersedes_template_id,created_by_account_id,updated_by_account_id)
				VALUES (${tenantId},${id},${input.code},${input.versionNumber},${input.name},${input.description},${input.fileFormat},
				${input.hasHeaderRow},${input.dateFormat},${input.timeZone},${input.supersedesId},${accountId},${accountId})`,
		)
		return id
	}

	/** Replace a draft's facts. */
	async updateTemplate(
		id: string,
		facts: Parameters<EmployeeImportRepository['updateTemplate']>[1],
	): Promise<void> {
		await this.exec(
			sql`UPDATE hcm.employee_import_template SET name=${facts.name},description=${facts.description},file_format=${facts.fileFormat},
				has_header_row=${facts.hasHeaderRow},date_format=${facts.dateFormat},time_zone=${facts.timeZone},
				revision=revision+1,updated_by_account_id=${this.scope.accountId},updated_at=now()
				WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Replace a draft's columns as a set. */
	async replaceColumns(templateId: string, columns: ImportColumnInput[]): Promise<void> {
		const { tenantId, accountId } = this.scope
		await this.exec(
			sql`DELETE FROM hcm.employee_import_template_column WHERE tenant_id=${tenantId} AND template_id=${templateId}`,
		)
		if (!columns.length) return
		const values = columns.map(
			/** One column row. */ (column, index) =>
				sql`(${tenantId},${randomUUID()},${templateId},${column.sourceColumnName},${column.sourceColumnOrdinal},
				${column.fieldCode},${column.transformationCode},${column.isMatchKey},${index},${accountId})`,
		)
		await this.exec(
			sql`INSERT INTO hcm.employee_import_template_column (tenant_id,id,template_id,source_column_name,source_column_ordinal,
				standard_field_code,transformation_code,is_match_key,sort_order,created_by_account_id) VALUES ${sql.join(values)}`,
		)
	}

	/** Retire the code's published version, then publish the draft. */
	async publishTemplate(id: string, code: string): Promise<void> {
		const { tenantId, accountId } = this.scope
		await this.exec(
			sql`UPDATE hcm.employee_import_template SET status='Retired',revision=revision+1,updated_by_account_id=${accountId},updated_at=now()
				WHERE tenant_id=${tenantId} AND code=${code} AND status='Published'`,
		)
		await this.exec(
			sql`UPDATE hcm.employee_import_template SET status='Published',published_at=now(),revision=revision+1,
				updated_by_account_id=${accountId},updated_at=now() WHERE tenant_id=${tenantId} AND id=${id}`,
		)
	}

	/** Run columns with template, requester and derived counts. */
	private runSelect(): RawBuilder<unknown> {
		return sql`SELECT r.id,r.template_id AS "templateId",t.code AS "templateCode",t.name AS "templateName",t.version_number AS "templateVersion",
				r.source_blob_id::text AS "sourceBlobId",r.source_file_name AS "fileName",r.status,r.intended_action AS "intendedAction",
				r.parser_version AS "parserVersion",r.source_digest AS "sourceDigest",r.total_row_count AS "totalRowCount",
				r.valid_row_count AS "validRowCount",r.invalid_row_count AS "invalidRowCount",r.committed_row_count AS "committedRowCount",
				r.failed_row_count AS "failedRowCount",r.skipped_row_count AS "skippedRowCount",
				(SELECT count(*)::int FROM hcm.employee_import_row x WHERE x.tenant_id=r.tenant_id AND x.run_id=r.id AND x.status='Valid'
					AND x.match_status IN ('Unique','Ambiguous') AND x.resolution IS NULL) AS "unresolvedRowCount",
				(SELECT count(*)::int FROM hcm.employee_import_issue i WHERE i.tenant_id=r.tenant_id AND i.run_id=r.id) AS "issueCount",
				r.failure_code AS "failureCode",r.cancel_reason AS "cancelReason",p.display_name AS "requestedBy",
				r.requested_by_account_id AS "requestedByAccountId",${stamp('r.requested_at')} AS "requestedAt",
				${stamp('r.validation_completed_at')} AS "validationCompletedAt",${stamp('r.commit_requested_at')} AS "commitRequestedAt",
				${stamp('r.completed_at')} AS "completedAt",r.revision,${sortKey('r.created_at')} AS "sortKey"
			FROM hcm.employee_import_run r
			JOIN hcm.employee_import_template t ON t.tenant_id=r.tenant_id AND t.id=r.template_id
			JOIN hcm.user_account a ON a.tenant_id=r.tenant_id AND a.id=r.requested_by_account_id
			JOIN hcm.person p ON p.tenant_id=a.tenant_id AND p.id=a.person_id`
	}

	/** Drop the cursor key from a run row. */
	private run_(raw: Record<string, unknown>): ImportRunRow {
		const { sortKey: key, ...row } = raw
		void key
		return row as unknown as ImportRunRow
	}

	/** A page of runs, newest first. */
	async runs(query: {
		limit: number
		cursor?: string
		status?: RunStatus
	}): Promise<HcmPage<ImportRunRow>> {
		const key = cursorBinding([this.scope.tenantId, 'import-runs', query.status ?? null])
		const after = decodeCursor(query.cursor, key, 2)
		const where: RawBuilder<unknown>[] = [sql`true`]
		if (query.status) where.push(sql`x.status=${query.status}`)
		if (after)
			where.push(sql`(x."sortKey",x.id COLLATE "C") < (${after[0]},${after[1]} COLLATE "C")`)
		const rows = await this.exec(
			sql<
				Record<string, unknown>
			>`SELECT x.* FROM (${this.runSelect()} WHERE r.tenant_id=${this.scope.tenantId}) x
				WHERE ${sql.join(where, sql` AND `)} ORDER BY x."sortKey" DESC,x.id COLLATE "C" DESC LIMIT ${query.limit + 1}`,
		)
		const page = keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last run. */ (row) => [row['sortKey'] as string, row['id'] as string],
		)
		return {
			items: page.items.map(/** Row. */ (row) => this.run_(row)),
			nextCursor: page.nextCursor,
		}
	}

	/** One run, optionally locked. */
	async run(id: string, lock = false): Promise<ImportRunRow | undefined> {
		if (lock)
			await this.exec(
				sql`SELECT 1 FROM hcm.employee_import_run WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		const [row] = await this.exec(
			sql<
				Record<string, unknown>
			>`${this.runSelect()} WHERE r.tenant_id=${this.scope.tenantId} AND r.id=${id}`,
		)
		return row ? this.run_(row) : undefined
	}

	/** Record an uploaded run. */
	async insertRun(input: Parameters<EmployeeImportRepository['insertRun']>[0]): Promise<string> {
		await this.exec(
			sql`INSERT INTO hcm.employee_import_run (tenant_id,id,template_id,source_blob_id,source_file_name,intended_action,
				source_digest,requested_by_account_id) VALUES (${this.scope.tenantId},${input.id},${input.templateId},
				${input.sourceBlobId}::uuid,${input.fileName},${input.intendedAction},${input.sourceDigest},${this.scope.accountId})`,
		)
		return input.id
	}

	/** Apply a run transition and bump its revision. */
	async updateRun(id: string, patch: RunPatch): Promise<void> {
		const sets: RawBuilder<unknown>[] = [sql`revision=revision+1`, sql`updated_at=now()`]
		if (patch.status) sets.push(sql`status=${patch.status}`)
		if (patch.parserVersion) sets.push(sql`parser_version=${patch.parserVersion}`)
		if (patch.failureCode !== undefined) sets.push(sql`failure_code=${patch.failureCode}`)
		if (patch.cancelReason) sets.push(sql`cancel_reason=${patch.cancelReason}`)
		if (patch.validated) sets.push(sql`validation_completed_at=now()`)
		if (patch.commitRequested)
			sets.push(
				sql`commit_requested_at=coalesce(commit_requested_at,now())`,
				sql`commit_requested_by_account_id=coalesce(commit_requested_by_account_id,${this.scope.accountId})`,
			)
		if (patch.completed) sets.push(sql`completed_at=now()`)
		await this.exec(
			sql`UPDATE hcm.employee_import_run SET ${sql.join(sets)} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Recount the run's totals from its rows. */
	async recount(id: string): Promise<void> {
		const counts = sql`SELECT count(*)::int AS total,
				count(*) FILTER (WHERE status<>'Invalid')::int AS valid,
				count(*) FILTER (WHERE status='Invalid')::int AS invalid,
				count(*) FILTER (WHERE status='Committed')::int AS committed,
				count(*) FILTER (WHERE status='CommitFailed')::int AS failed,
				count(*) FILTER (WHERE status='Skipped')::int AS skipped
				FROM hcm.employee_import_row WHERE tenant_id=${this.scope.tenantId} AND run_id=${id}`
		await this.exec(
			sql`UPDATE hcm.employee_import_run r SET total_row_count=c.total,valid_row_count=c.valid,invalid_row_count=c.invalid,
				committed_row_count=c.committed,failed_row_count=c.failed,skipped_row_count=c.skipped,updated_at=now()
				FROM (${counts}) c WHERE r.tenant_id=${this.scope.tenantId} AND r.id=${id}`,
		)
	}

	/** Row columns. */
	private rowSelect(): RawBuilder<unknown> {
		return sql`SELECT id,source_row_number AS "rowNumber",source_row_digest AS digest,status,match_status AS "matchStatus",
				proposed_action AS "proposedAction",matched_worker_ids AS "matchedWorkerIds",resolution,
				resolution_worker_id AS "resolutionWorkerId",resolution_reason AS "resolutionReason",failure_code AS "failureCode",
				result_worker_id AS "resultWorkerId",revision
			FROM hcm.employee_import_row`
	}

	/** A page of a run's rows in source order. */
	async rows(
		runId: string,
		query: { limit: number; cursor?: string; status?: RowStatus; matchStatus?: MatchStatus },
	): Promise<HcmPage<ImportRowRow>> {
		const key = cursorBinding([
			this.scope.tenantId,
			'import-rows',
			runId,
			query.status ?? null,
			query.matchStatus ?? null,
		])
		const after = decodeCursor(query.cursor, key, 1)
		const where: RawBuilder<unknown>[] = [
			sql`tenant_id=${this.scope.tenantId}`,
			sql`run_id=${runId}`,
		]
		if (query.status) where.push(sql`status=${query.status}`)
		if (query.matchStatus) where.push(sql`match_status=${query.matchStatus}`)
		if (after) where.push(sql`source_row_number > ${Number(after[0])}`)
		const rows = await this.exec(
			sql<ImportRowRow>`${this.rowSelect()} WHERE ${sql.join(where, sql` AND `)}
				ORDER BY source_row_number LIMIT ${query.limit + 1}`,
		)
		return keysetPage(
			rows,
			query.limit,
			key,
			/** Continue after the last row. */ (row) => [row.rowNumber],
		)
	}

	/** One row of a run, optionally locked. */
	async row(runId: string, rowId: string, lock = false): Promise<ImportRowRow | undefined> {
		const [row] = await this.exec(
			sql<ImportRowRow>`${this.rowSelect()} WHERE tenant_id=${this.scope.tenantId} AND run_id=${runId} AND id=${rowId}
				${lock ? sql`FOR UPDATE` : sql``}`,
		)
		return row
	}

	/** Every row of a run in source order. */
	allRows(runId: string): Promise<ImportRowRow[]> {
		return this.exec(
			sql<ImportRowRow>`${this.rowSelect()} WHERE tenant_id=${this.scope.tenantId} AND run_id=${runId} ORDER BY source_row_number`,
		)
	}

	/** Insert validated rows and their issues. */
	async insertRows(runId: string, rows: NewImportRow[]): Promise<void> {
		const { tenantId } = this.scope
		for (let start = 0; start < rows.length; start += 200) {
			const batch = rows
				.slice(start, start + 200)
				.map(/** With an id. */ (row) => ({ ...row, id: randomUUID() }))
			await this.exec(
				sql`INSERT INTO hcm.employee_import_row (tenant_id,id,run_id,source_row_number,source_row_digest,match_status,
					proposed_action,status,matched_worker_ids,row_idempotency_key) VALUES ${sql.join(
						batch.map(
							/** One row. */ (row) =>
								sql`(${tenantId},${row.id},${runId},${row.rowNumber},${row.digest},${row.matchStatus},${row.proposedAction},
								${row.status},${row.matchedWorkerIds}::text[],${`import:${runId}:${row.rowNumber}`})`,
						),
					)}`,
			)
			const issues = batch.flatMap(
				/** Row issues. */ (row) =>
					row.issues.map(/** With row. */ (item) => ({ ...item, rowId: row.id })),
			)
			await this.insertIssues(runId, issues)
		}
	}

	/** Insert issues in one statement. */
	private async insertIssues(
		runId: string,
		issues: (Omit<ImportIssueRow, 'rowId' | 'rowNumber'> & { rowId: string | null })[],
	): Promise<void> {
		if (!issues.length) return
		const { tenantId } = this.scope
		await this.exec(
			sql`INSERT INTO hcm.employee_import_issue (tenant_id,id,run_id,row_id,standard_field_code,source_column_name,severity,
				issue_code,safe_message,is_blocking) VALUES ${sql.join(
					issues.map(
						/** One issue. */ (item) =>
							sql`(${tenantId},${randomUUID()},${runId},${item.rowId},${item.fieldCode},${item.sourceColumnName},
							${item.severity},${item.code},${item.message},${item.severity === 'Error'})`,
					),
				)}`,
		)
	}

	/** Record run-level issues. */
	insertRunIssues(
		runId: string,
		issues: Omit<ImportIssueRow, 'rowId' | 'rowNumber'>[],
	): Promise<void> {
		return this.insertIssues(
			runId,
			issues.map(/** No row. */ (item) => ({ ...item, rowId: null })),
		)
	}

	/** Record a row resolution. */
	async resolveRow(
		rowId: string,
		resolution: { resolution: string; workerId: string | null; reason: string | null },
	): Promise<void> {
		await this.exec(
			sql`UPDATE hcm.employee_import_row SET resolution=${resolution.resolution},resolution_worker_id=${resolution.workerId},
				resolution_reason=${resolution.reason},resolved_by_account_id=${this.scope.accountId},resolved_at=now(),
				revision=revision+1,updated_at=now() WHERE tenant_id=${this.scope.tenantId} AND id=${rowId}`,
		)
	}

	/** Record a row's commit outcome. */
	async markRow(
		rowId: string,
		outcome: { status: RowStatus; resultWorkerId?: string | null; failureCode?: string | null },
	): Promise<void> {
		await this.exec(
			sql`UPDATE hcm.employee_import_row SET status=${outcome.status},result_worker_id=${outcome.resultWorkerId ?? null},
				failure_code=${outcome.failureCode ?? null},committed_at=${outcome.status === 'Committed' ? sql`now()` : sql`NULL`},
				revision=revision+1,updated_at=now() WHERE tenant_id=${this.scope.tenantId} AND id=${rowId}`,
		)
	}

	/** Issues of a run, or of some of its rows, in row order; run-level issues first. */
	issues(runId: string, rowIds?: string[]): Promise<ImportIssueRow[]> {
		const rows = rowIds ? sql`AND i.row_id = ANY(${rowIds}::text[])` : sql``
		return this.exec(
			sql<ImportIssueRow>`SELECT i.row_id AS "rowId",x.source_row_number AS "rowNumber",i.standard_field_code AS "fieldCode",
				i.source_column_name AS "sourceColumnName",i.severity,i.issue_code AS code,i.safe_message AS message
				FROM hcm.employee_import_issue i
				LEFT JOIN hcm.employee_import_row x ON x.tenant_id=i.tenant_id AND x.id=i.row_id
				WHERE i.tenant_id=${this.scope.tenantId} AND i.run_id=${runId} ${rows}
				ORDER BY x.source_row_number NULLS FIRST,i.created_at,i.id`,
		)
	}

	/** Run work in a savepoint; a failure rolls it back and is rethrown. */
	async savepoint<T>(work: () => Promise<T>): Promise<T> {
		const name = sql.raw(`import_row_${randomUUID().replace(/-/g, '')}`)
		await sql`SAVEPOINT ${name}`.execute(this.scope.executor)
		try {
			const result = await work()
			await sql`RELEASE SAVEPOINT ${name}`.execute(this.scope.executor)
			return result
		} catch (error) {
			await sql`ROLLBACK TO SAVEPOINT ${name}`.execute(this.scope.executor)
			throw error
		}
	}

	/** Names and numbers of workers. */
	async workers(ids: string[]): Promise<Map<string, { name: string; workerNumber: string }>> {
		if (!ids.length) return new Map()
		const rows = await this.exec(
			sql<{
				id: string
				name: string
				workerNumber: string
			}>`SELECT w.id,p.display_name AS name,w.worker_code AS "workerNumber"
				FROM hcm.worker w JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
				WHERE w.tenant_id=${this.scope.tenantId} AND w.id = ANY(${ids}::text[])`,
		)
		return new Map(
			rows.map(/** Entry. */ (row) => [row.id, { name: row.name, workerNumber: row.workerNumber }]),
		)
	}

	/** Worker ids by worker number. */
	async workersByNumber(numbers: string[]): Promise<Map<string, string>> {
		if (!numbers.length) return new Map()
		const rows = await this.exec(
			sql<{ id: string; code: string }>`SELECT id,worker_code AS code FROM hcm.worker
				WHERE tenant_id=${this.scope.tenantId} AND worker_code = ANY(${numbers}::text[])`,
		)
		return new Map(rows.map(/** Entry. */ (row) => [row.code, row.id]))
	}
}
