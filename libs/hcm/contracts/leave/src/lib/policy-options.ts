import { idValue, invalidField, preservedTextValue } from '@empflowyee/hcm-runtime-contract'
import type { LeaveUnit } from './hcm-leave-contract'
export interface LeavePolicyOptionsQuery {
	q: string
	limit: number
	id?: string
	cursor?: string
}
export interface LeaveTypeOption {
	id: string
	label: string
	code: string
	unit: LeaveUnit
	category: 'Annual' | 'Sick' | 'Casual' | 'Parental' | 'Unpaid' | 'CompOff' | 'Other'
	revision: number
	state: 'Active' | 'Inactive'
}
export interface LeavePolicyOptions {
	leaveTypes: LeaveTypeOption[]
	nextCursor: string | null
}

/** Parse a bounded authorized type picker without permitting client tenant selectors. */
export function readLeavePolicyOptionsQuery(params: URLSearchParams): LeavePolicyOptionsQuery {
	for (const key of params.keys())
		if (!['q', 'limit', 'id', 'cursor'].includes(key) || params.getAll(key).length !== 1)
			invalidField(key, 'unknown')
	const q = params.get('q') ?? '',
		limit = params.get('limit') ?? '25'
	if (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) invalidField('limit')
	const result: LeavePolicyOptionsQuery = {
		q: preservedTextValue(q, 'q', 200, false),
		limit: Number(limit),
	}
	const id = params.get('id'),
		cursor = params.get('cursor')
	if (id !== null) result.id = idValue(id, 'id')
	if (cursor !== null) {
		if (!/^[A-Za-z0-9_-]{43}$/.test(cursor)) invalidField('cursor')
		result.cursor = cursor
	}
	return result
}
