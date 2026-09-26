import { sql, type RawBuilder } from 'kysely'
import {
	classifyConstraint,
	cursorBinding,
	decodeCursor,
	keysetPage,
} from '@empflowyee/hcm-api-database-kysely'
import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type {
	IncumbentRow,
	PositionOccupancy,
	PositionOccupancyPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { WorkforceScope } from './structure-repository'

/** Employments whose assignments occupy positions; Pending and Ended never do. */
const OCCUPYING = sql`('Active','OnNotice','Suspended')`

/** Occupancy from effective assignments linked to positions. */
export class KyselyPositionOccupancy implements PositionOccupancyPort {
	/** Bind to the caller's authorized transaction. */
	constructor(private readonly scope: WorkforceScope) {}

	/** Execute one query and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/**
	 * Assignments linked to positions and effective on a date, plus minimal spine rows, which have no
	 * dated facts and make occupancy incomplete.
	 */
	private linked(asOf: string): RawBuilder<unknown> {
		return sql`SELECT a.id,a.position_id,a.full_time_equivalent,a.is_primary_assignment,a.effective_from,a.designation_id,e.worker_id,e.employment_status
			FROM hcm.assignment a JOIN hcm.employment e ON e.tenant_id=a.tenant_id AND e.id=a.employment_id
			WHERE a.tenant_id=${this.scope.tenantId} AND a.position_id IS NOT NULL AND (a.effective_period @> ${asOf}::date OR a.effective_from IS NULL)
			AND (e.employment_status IS NULL OR e.employment_status IN ${OCCUPYING})`
	}

	/** Occupancy of each position; an assignment without status or FTE makes it incomplete. */
	async occupancy(
		positionIds: readonly string[],
		asOf: string,
	): Promise<Map<string, PositionOccupancy>> {
		const result = new Map<string, PositionOccupancy>(
			positionIds.map(
				/** Complete zero until assignments are found. */ (id) => [
					id,
					{ positionId: id, headcount: 0, fte: 0, complete: true },
				],
			),
		)
		if (!positionIds.length) return result
		const rows = await this.run(
			sql<{
				positionId: string
				headcount: number
				fte: number
				unknown: number
			}>`SELECT l.position_id AS "positionId",count(DISTINCT l.worker_id)::int AS headcount,coalesce(sum(l.full_time_equivalent),0)::float8 AS fte,
				count(*) FILTER (WHERE l.full_time_equivalent IS NULL OR l.effective_from IS NULL OR l.employment_status IS NULL)::int AS unknown
				FROM (${this.linked(asOf)}) l WHERE l.position_id = ANY(${[...positionIds]}::text[]) GROUP BY l.position_id`,
		)
		for (const row of rows) {
			const complete = row.unknown === 0
			result.set(row.positionId, {
				positionId: row.positionId,
				headcount: complete ? row.headcount : null,
				fte: complete ? Math.round(row.fte * 100) / 100 : null,
				complete,
			})
		}
		return result
	}

	/** Effective assignments occupying one position. */
	async incumbents(
		positionId: string,
		asOf: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<IncumbentRow>> {
		const t = this.scope.tenantId
		const key = cursorBinding([t, positionId, asOf, page.limit])
		const after = decodeCursor(page.cursor, key, 2)
		const rows = await this.run(
			sql<IncumbentRow>`SELECT * FROM (SELECT l.id AS "assignmentId",l.worker_id AS "workerId",p.display_name AS "displayName",
					(SELECT d.name FROM hcm.designation d WHERE d.tenant_id=${t} AND d.id=l.designation_id) AS designation,
					l.full_time_equivalent::float8 AS "fullTimeEquivalent",coalesce(l.is_primary_assignment,false) AS primary,
					to_char(l.effective_from,'YYYY-MM-DD') AS "effectiveFrom"
				FROM (${this.linked(asOf)}) l
				JOIN hcm.worker w ON w.tenant_id=${t} AND w.id=l.worker_id
				JOIN hcm.person p ON p.tenant_id=w.tenant_id AND p.id=w.person_id
				WHERE l.position_id=${positionId} AND l.effective_from IS NOT NULL) i
				${after ? sql`WHERE (i."displayName" COLLATE "C",i."assignmentId" COLLATE "C") > (${after[0]} COLLATE "C",${after[1]} COLLATE "C")` : sql``}
				ORDER BY i."displayName" COLLATE "C",i."assignmentId" COLLATE "C" LIMIT ${page.limit + 1}`,
		)
		return keysetPage(
			rows,
			page.limit,
			key,
			/** Continue after the last incumbent. */ (row) => [row.displayName, row.assignmentId],
		)
	}
}
