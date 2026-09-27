import { Logger, StreamableFile } from '@nestjs/common'
import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { OpenedAttachment } from '@empflowyee/hcm-api-documents-application'

/** Largest accepted HR service attachment; one byte more marks the upload too large. */
export const HR_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Stream an already-authorized, audited HR service attachment with safe download headers. */
export function hrAttachment(
	attachment: OpenedAttachment,
	response: ServerResponse,
	logger: Logger,
): StreamableFile {
	let closed = false
	/** Release the descriptor once, whether the stream finished or the client left. */
	const close = async () => {
		if (closed) return
		closed = true
		try {
			await attachment.close()
		} catch {
			logger.warn('HR attachment descriptor could not be released')
		}
	}
	response.once('finish', /** Completed. */ () => void close())
	response.once('close', /** Completed or abandoned. */ () => void close())
	response.setHeader('X-Content-Type-Options', 'nosniff')
	response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
	const fallback = attachment.fileName.replace(/[^a-zA-Z0-9._ -]/g, '_')
	return new StreamableFile(Readable.from(attachment.bytes), {
		type: attachment.mediaType,
		length: attachment.sizeBytes,
		disposition: `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName).replace(/'/g, '%27')}`,
	})
}
