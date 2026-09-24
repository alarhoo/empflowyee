import { Logger, StreamableFile } from '@nestjs/common'
import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { TemplateDownload } from '@empflowyee/hcm-api-documents-application'
/** Stream only already-authorized attachments with bounded safe headers and observed audit completion. */
export function documentAttachment(
	download: TemplateDownload,
	response: ServerResponse,
	logger: Logger,
): StreamableFile {
	let observed = false
	/** Close the descriptor and record at most one observable stream outcome. */
	const finish = async (ok: boolean) => {
		if (observed) return
		observed = true
		try {
			await download.close()
			await download.complete(ok)
		} catch {
			logger.warn('Document stream outcome could not be recorded')
		}
	}
	response.once(
		'finish',
		/** Server completion does not assert client receipt. */ () => {
			void finish(true)
		},
	)
	response.once(
		'close',
		/** Early client disconnect records failure when observable. */ () => {
			void finish(response.writableFinished)
		},
	)
	response.setHeader('X-Content-Type-Options', 'nosniff')
	response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
	const fallback = download.file.filename.replace(/[^a-zA-Z0-9._ -]/g, '_')
	return new StreamableFile(Readable.from(download.bytes), {
		type: download.file.mediaType,
		length: download.file.byteLength,
		disposition: `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(download.file.filename).replace(/'/g, '%27')}`,
	})
}
