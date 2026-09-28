import { idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import type { AttendanceConfigurationState } from './hcm-attendance-contract'
import { configurationText } from './configuration-validation'

export interface ScheduleListQuery {
	limit: number
	sort: 'code' | 'name' | 'state' | 'id'
	direction: 'asc' | 'desc'
	code?: string
	name?: string
	state?: AttendanceConfigurationState
	id?: string
	cursor?: string
}

/** Reject ambiguous duplicate query keys and unsupported selectors before SQL sees them. */
function allowParameters(params: URLSearchParams, allowed: readonly string[]): void {
	for (const key of params.keys()) {
		if (!allowed.includes(key) || params.getAll(key).length !== 1) invalidField(key, 'unknown')
	}
}

/** Parse the admitted latest-version configuration list contract without client sorting of partial results. */
export function parseScheduleListQuery(params: URLSearchParams): ScheduleListQuery {
	allowParameters(params, ['limit', 'sort', 'code', 'name', 'state', 'id', 'cursor'])
	const limit = params.get('limit') ?? '25'
	if (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) invalidField('limit')
	const sortValue = params.get('sort') ?? 'code:asc'
	if (!/^(code|name|state|id)(:(asc|desc))?$/.test(sortValue)) invalidField('sort')
	const [sort, direction = 'asc'] = sortValue.split(':') as [
		ScheduleListQuery['sort'],
		ScheduleListQuery['direction']?,
	]
	const result: ScheduleListQuery = { limit: Number(limit), sort, direction }
	for (const field of ['code', 'name'] as const) {
		const value = params.get(field)
		if (value !== null) result[field] = configurationText(value, field, field === 'code' ? 40 : 120)
	}
	const state = params.get('state')
	if (state !== null) {
		if (!['Draft', 'Published', 'Retired'].includes(state)) invalidField('state')
		result.state = state as AttendanceConfigurationState
	}
	const id = params.get('id')
	if (id !== null) result.id = idValue(id, 'id')
	const cursor = params.get('cursor')
	if (cursor !== null) {
		if (!/^[A-Za-z0-9_-]{43}$/.test(cursor)) invalidField('cursor')
		result.cursor = cursor
	}
	return result
}

/** Select one exact version; writes cannot default to a potentially different latest draft. */
export function parseScheduleVersionQuery(
	params: URLSearchParams,
	required = false,
): string | undefined {
	allowParameters(params, ['version'])
	const version = params.get('version')
	if (version !== null) return idValue(version, 'version')
	if (required) invalidField('version', 'required')
	return undefined
}
