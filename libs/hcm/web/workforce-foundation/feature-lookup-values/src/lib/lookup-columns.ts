import type {
	LookupSetKey,
	LookupValueDto,
	WORKER_EVENT_CATEGORIES,
} from '@empflowyee/hcm-workforce-foundation-contract'

export const MANAGE_PERMISSION = 'hcm.workforce-foundation.lookups.manage'

export interface LookupColumn {
	label: string
	importance: number
	minWidth: string
	/** Boolean attributes render as display-only CheckBoxes; others as text. */
	check?: boolean
	read(attributes: Record<string, unknown>): string | boolean
}

const categoryLabels: Record<(typeof WORKER_EVENT_CATEGORIES)[number], string> = {
	Hire: 'Hire',
	Confirm: 'Confirm',
	Promote: 'Promote',
	Transfer: 'Transfer',
	Demote: 'Demote',
	CompensationChange: 'Compensation change',
	Leave: 'Leave',
	Suspend: 'Suspend',
	Exit: 'Exit',
	Rehire: 'Rehire',
	Other: 'Other',
}

/** Display text of a worker event category. */
export function categoryLabel(category: string): string {
	return categoryLabels[category as keyof typeof categoryLabels] ?? category
}

/** Build a display-only yes/no column over one attribute. */
function flag(label: string, key: string): LookupColumn {
	return {
		label,
		importance: 20,
		minWidth: '7rem',
		check: true,
		read: /** Read one boolean attribute. */ (a) => a[key] === true,
	}
}

/** Build a text column over one attribute. */
function text(label: string, read: (a: Record<string, unknown>) => string): LookupColumn {
	return { label, importance: 40, minWidth: '9rem', read }
}

/** Set-specific attribute columns between the name and status columns. */
export const ATTRIBUTE_COLUMNS: Record<LookupSetKey, LookupColumn[]> = {
	'worker-types': [
		text('Statutory class', /** Product enum. */ (a) => String(a['statutoryClass'] ?? '')),
		flag('Payroll eligible', 'payrollEligible'),
		flag('Benefit eligible', 'benefitEligible'),
	],
	'employment-end-reasons': [
		flag('Voluntary', 'voluntary'),
		flag('Regrettable', 'regrettable'),
		flag('Rehire eligible', 'rehireEligible'),
	],
	'worker-event-types': [
		text('Category', /** Product enum. */ (a) => categoryLabel(String(a['category'] ?? ''))),
		flag('Requires approval', 'requiresApproval'),
	],
	genders: [
		text('Statutory class', /** Product value. */ (a) => String(a['statutoryClass'] ?? '')),
	],
	'marital-statuses': [],
	'relationship-types': [
		text('Inverse', /** Inverse relationship code. */ (a) => String(a['inverseCode'] ?? '—')),
		flag('Family', 'familyRelation'),
		flag('Dependent eligible', 'dependentEligible'),
		flag('Nominee eligible', 'nomineeEligible'),
	],
	countries: [flag('Supported', 'supported')],
	currencies: [
		text('Symbol', /** Currency symbol. */ (a) => String(a['symbol'] ?? '')),
		text('Minor units', /** Decimal places. */ (a) => String(a['minorUnitDigits'] ?? '')),
	],
}

/** Read a value's attributes as a plain record for generic columns. */
export function attributesOf(value: LookupValueDto): Record<string, unknown> {
	return value.attributes as unknown as Record<string, unknown>
}
