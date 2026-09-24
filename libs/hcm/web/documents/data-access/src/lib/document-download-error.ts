import { HttpErrorResponse } from '@angular/common/http'
/** Decode bounded JSON errors from attachment requests while preserving their HTTP status and safe error contract. */
export async function rethrowDocumentDownloadError(error: unknown): Promise<never> {
	if (
		error instanceof HttpErrorResponse &&
		error.error instanceof Blob &&
		error.error.type.includes('application/json') &&
		error.error.size <= 16384
	) {
		let body: unknown
		try {
			body = JSON.parse(await error.error.text())
		} catch {
			throw error
		}
		throw new HttpErrorResponse({
			error: body,
			status: error.status,
			statusText: error.statusText,
			headers: error.headers,
			url: error.url ?? undefined,
		})
	}
	throw error
}
