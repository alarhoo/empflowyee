import busboy from 'busboy'
import type { IncomingMessage } from 'node:http'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

/** Largest accepted import source; one byte more marks the upload too large. */
const MAX_BYTES = 5 * 1024 * 1024

/** A parsed import upload: JSON metadata first, then exactly one bounded file. */
export interface ImportUpload {
	metadata: unknown
	fileName: string
	mediaType: string
	bytes: Buffer
}

/** A parsed upload whose file part may be absent. */
export interface OptionalUpload {
	metadata: unknown
	file: { fileName: string; mediaType: string; bytes: Buffer } | null
}

/** Read `metadata` then one `file` part, buffering at most 5 MiB; anything else is refused. */
export async function importMultipart(request: IncomingMessage): Promise<ImportUpload> {
	const upload = await multipart(request, MAX_BYTES, false)
	if (!upload.file) throw new HcmDomainError('invalid-request')
	return { metadata: upload.metadata, ...upload.file }
}

/**
 * Read `metadata` then at most one `file` part of at most `maxBytes`; the file may be omitted only
 * when `optional`. Anything else is refused.
 */
export function multipart(
	request: IncomingMessage,
	maxBytes: number,
	optional: boolean,
): Promise<OptionalUpload> {
	return new Promise(
		/** Settle once the parser closes or fails. */ (resolve, reject) => {
			let parser: ReturnType<typeof busboy>
			try {
				parser = busboy({
					headers: request.headers,
					limits: { fieldSize: 16384, fields: 1, files: 1, parts: 3, fileSize: maxBytes },
				})
			} catch {
				reject(new HcmDomainError('invalid-request'))
				return
			}
			let failure: HcmDomainError | null = null
			let metadata: unknown
			let hasMetadata = false
			let file: {
				fileName: string
				mediaType: string
				chunks: Buffer[]
				truncated: boolean
			} | null = null
			/** Keep the first failure only. */
			const fail = (error: HcmDomainError) => {
				failure ??= error
			}
			parser.on(
				'field',
				/** One JSON metadata part before the file. */ (name, value, info) => {
					if (name !== 'metadata' || hasMetadata || file || info.valueTruncated) {
						fail(new HcmDomainError('invalid-request'))
						return
					}
					try {
						metadata = JSON.parse(value)
						hasMetadata = true
					} catch {
						fail(new HcmDomainError('invalid-request'))
					}
				},
			)
			parser.on(
				'file',
				/** One file part after the metadata. */ (name, stream, info) => {
					if (name !== 'file' || !hasMetadata || file) {
						fail(new HcmDomainError('invalid-request'))
						stream.resume()
						return
					}
					const current = {
						fileName: info.filename ?? '',
						mediaType: info.mimeType ?? '',
						chunks: [] as Buffer[],
						truncated: false,
					}
					file = current
					stream.on('data', /** Buffer. */ (chunk: Buffer) => current.chunks.push(chunk))
					stream.on('limit', /** Too large. */ () => (current.truncated = true))
				},
			)
			for (const event of ['partsLimit', 'filesLimit', 'fieldsLimit'] as const)
				parser.on(event, /** Extra parts. */ () => fail(new HcmDomainError('invalid-request')))
			parser.on(
				'error',
				/** Malformed input. */ () => {
					fail(new HcmDomainError('invalid-request'))
					request.unpipe(parser)
					request.resume()
					reject(failure)
				},
			)
			parser.on(
				'close',
				/** Settle with the upload or the first failure. */ () => {
					if (!failure && file?.truncated) fail(new HcmDomainError('file-too-large'))
					if (!failure && !hasMetadata) fail(new HcmDomainError('invalid-request'))
					if (!failure && (file ? !file.fileName : !optional))
						fail(new HcmDomainError('invalid-request'))
					if (failure) reject(failure)
					else resolve({ metadata, file: file ? uploaded(file) : null })
				},
			)
			request.pipe(parser)
		},
	)
}

/** The buffered file of a parsed upload. */
function uploaded(file: { fileName: string; mediaType: string; chunks: Buffer[] }) {
	return { fileName: file.fileName, mediaType: file.mediaType, bytes: Buffer.concat(file.chunks) }
}
