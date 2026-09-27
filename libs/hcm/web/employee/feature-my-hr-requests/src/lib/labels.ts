import type { HrStatus } from '@empflowyee/hcm-employee-contract'

export const BASE_ROUTE = '/employee/my-hr-requests'
export const MANAGE_PERMISSION = 'hcm.employee.hr-requests.self.manage'

type Semantic = 'positive' | 'critical' | 'negative' | 'informative' | 'neutral'

const STATUS: Record<HrStatus, { label: string; status: Semantic }> = {
	New: { label: 'Submitted', status: 'informative' },
	Open: { label: 'In progress', status: 'informative' },
	WaitingForEmployee: { label: 'Waiting for you', status: 'critical' },
	WaitingForHr: { label: 'With HR', status: 'informative' },
	Resolved: { label: 'Resolved', status: 'positive' },
	Closed: { label: 'Closed', status: 'neutral' },
	Cancelled: { label: 'Cancelled', status: 'neutral' },
}

/** Semantic presentation of a request status from the requester's point of view. */
export function requestStatus(value: HrStatus) {
	return STATUS[value]
}

/** A profile field code as words, such as `birth-date` to `birth date`; never its value. */
export function fieldWords(code: string): string {
	return code.replace(/[-_]+/g, ' ').trim()
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
