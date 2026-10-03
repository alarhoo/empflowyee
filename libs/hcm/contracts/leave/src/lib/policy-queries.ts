import {
	enumValue,
	idValue,
	invalidField,
	preservedTextValue,
} from '@empflowyee/hcm-runtime-contract'
export interface LeavePolicyListQuery {
	limit: number
	sort: 'code' | 'name' | 'state' | 'id'
	direction: 'asc' | 'desc'
	id?: string
	code?: string
	name?: string
	state?: 'Draft' | 'Published' | 'Retired'
	cursor?: string
}
/** Parse the approved server-owned list without ambiguous duplicate query keys. */
export function readLeavePolicyListQuery(params: URLSearchParams): LeavePolicyListQuery {
	for (const key of params.keys())
		if (
			!['limit', 'sort', 'id', 'code', 'name', 'state', 'cursor'].includes(key) ||
			params.getAll(key).length !== 1
		)
			invalidField(key, 'unknown')
	const limit = params.get('limit') ?? '25',
		sortValue = params.get('sort') ?? 'code:asc'
	if (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) invalidField('limit')
	if (!/^(code|name|state|id)(:(asc|desc))?$/.test(sortValue)) invalidField('sort')
	const [sort, direction = 'asc'] = sortValue.split(':') as [
		LeavePolicyListQuery['sort'],
		LeavePolicyListQuery['direction']?,
	]
	const result: LeavePolicyListQuery = { limit: Number(limit), sort, direction }
	for (const field of ['code', 'name'] as const) {
		const value = params.get(field)
		if (value !== null)
			result[field] = preservedTextValue(value, field, field === 'code' ? 40 : 120)
	}
	const id = params.get('id'),
		state = params.get('state'),
		cursor = params.get('cursor')
	if (id !== null) result.id = idValue(id, 'id')
	if (state !== null)
		result.state = enumValue(state, 'state', ['Draft', 'Published', 'Retired'] as const)
	if (cursor !== null) {
		if (!/^[A-Za-z0-9_-]{43}$/.test(cursor)) invalidField('cursor')
		result.cursor = cursor
	}
	return result
}
