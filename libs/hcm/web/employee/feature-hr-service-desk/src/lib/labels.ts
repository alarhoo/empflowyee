import type {
	HrCategory,
	HrConfigKind,
	HrPriority,
	HrResolutionCode,
	HrStatus,
	SlaState,
} from '@empflowyee/hcm-employee-contract'

export const HANDLE_PERMISSION = 'hcm.employee.hr-service.handle'
export const CONFIGURE_PERMISSION = 'hcm.employee.hr-service.configure'
export const BASE_ROUTE = '/employee/hr-service-desk'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'
type Presented = { label: string; status: Semantic }

export const STATUS_LABELS: Record<HrStatus, string> = {
	New: 'New',
	Open: 'Open',
	WaitingForEmployee: 'Waiting for employee',
	WaitingForHr: 'Waiting for HR',
	Resolved: 'Resolved',
	Closed: 'Closed',
	Cancelled: 'Cancelled',
}

export const PRIORITY_LABELS: Record<HrPriority, string> = {
	P1: 'P1 Urgent',
	P2: 'P2 High',
	P3: 'P3 Normal',
	P4: 'P4 Low',
}

export const RESOLUTION_LABELS: Record<HrResolutionCode, string> = {
	Answered: 'Answered',
	Corrected: 'Corrected',
	NoActionNeeded: 'No action needed',
	Duplicate: 'Duplicate',
	OutOfScope: 'Out of scope',
}

export const CATEGORY_LABELS: Record<HrCategory, string> = {
	PersonalData: 'Personal data',
	Employment: 'Employment',
	Pay: 'Pay',
	Leave: 'Leave',
	Documents: 'Documents',
	General: 'General',
}

export const CONFIG_LABELS: Record<HrConfigKind, { plural: string; singular: string }> = {
	teams: { plural: 'Teams', singular: 'team' },
	memberships: { plural: 'Memberships', singular: 'membership' },
	'request-types': { plural: 'Request types', singular: 'request type' },
	'service-levels': { plural: 'Service levels', singular: 'service level' },
}

export const TARGET_LABELS = { FirstResponse: 'First response', Resolution: 'Resolution' } as const

const SLA: Record<SlaState, Presented> = {
	OnTrack: { label: 'On track', status: 'informative' },
	DueSoon: { label: 'Due soon', status: 'critical' },
	Breached: { label: 'Breached', status: 'negative' },
	Paused: { label: 'Paused', status: 'neutral' },
	Met: { label: 'Met', status: 'positive' },
	None: { label: 'No target', status: 'neutral' },
}

const STATUS: Record<HrStatus, Semantic> = {
	New: 'informative',
	Open: 'informative',
	WaitingForEmployee: 'critical',
	WaitingForHr: 'informative',
	Resolved: 'positive',
	Closed: 'neutral',
	Cancelled: 'neutral',
}

const PRIORITY: Record<HrPriority, Semantic> = {
	P1: 'negative',
	P2: 'critical',
	P3: 'informative',
	P4: 'neutral',
}

/** Semantic presentation of an SLA state; Breached is Negative and due soon Critical. */
export function slaStatus(value: SlaState): Presented {
	return SLA[value]
}

/** Semantic presentation of a request status. */
export function requestStatus(value: HrStatus): Presented {
	return { label: STATUS_LABELS[value], status: STATUS[value] }
}

/** Semantic presentation of a priority. */
export function priorityStatus(value: HrPriority): Presented {
	return { label: PRIORITY_LABELS[value], status: PRIORITY[value] }
}

/** A duration in minutes as days, hours and minutes. */
export function duration(minutes: number): string {
	const days = Math.floor(minutes / 1440)
	const hours = Math.floor((minutes % 1440) / 60)
	const rest = minutes % 60
	const parts = [days ? `${days} d` : '', hours ? `${hours} h` : '', rest ? `${rest} min` : '']
	return parts.filter(Boolean).join(' ') || '0 min'
}

/** A file size for display. */
export function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Save a downloaded file without an inline preview or a lasting object URL. */
export function saveFile(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = fileName
	link.click()
	setTimeout(
		/** Release the temporary object URL after saving starts. */ () => URL.revokeObjectURL(url),
		1000,
	)
}
