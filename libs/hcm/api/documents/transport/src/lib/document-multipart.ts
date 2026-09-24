import busboy from 'busboy'
import type { IncomingMessage } from 'node:http'
import type { Readable } from 'node:stream'
import { DocumentError } from '@empflowyee/hcm-documents-contract'

/** Stream exactly metadata-then-file, waiting for complete multipart validation before storage can reserve success. */
export async function documentMultipart<Intent, Result>(
	request: IncomingMessage,
	prepare: (metadata: unknown) => Promise<Intent>,
	consume: (
		intent: Intent,
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	) => Promise<Result>,
): Promise<Result> {
	let failure: unknown,
		metadata: unknown,
		hasMetadata = false,
		fileCount = 0,
		result: Promise<Result> | undefined,
		file: Readable | undefined
	let parser: ReturnType<typeof busboy>
	try {
		parser = busboy({
			headers: request.headers,
			limits: { fieldSize: 16384, fields: 1, files: 1, parts: 3, fileSize: 10485761 },
		})
	} catch {
		throw new DocumentError('invalid-request')
	}

	let finishParsing: () => void =
		/** Parser close will replace this initializer before piping input. */ () => undefined
	const parsed = new Promise<void>(
		/** Resolve on parser completion or failure, leaving one controlled error path. */ (
			resolve,
		) => {
			finishParsing = resolve
		},
	)
	parser.on(
		'field',
		/** Require one bounded JSON metadata part before file bytes. */ (name, value, info) => {
			try {
				if (
					name !== 'metadata' ||
					hasMetadata ||
					fileCount ||
					info.valueTruncated ||
					info.nameTruncated
				)
					throw new DocumentError('invalid-request')
				metadata = JSON.parse(value)
				hasMetadata = true
			} catch {
				failure = new DocumentError('invalid-request')
			}
		},
	)
	parser.on(
		'file',
		/** Pause bytes until the owning application authorizes target metadata. */ (
			name,
			stream,
			info,
		) => {
			file = stream
			fileCount++
			stream.on(
				'error',
				/** The async iterator and parser completion own error propagation. */ () => undefined,
			)
			if (name !== 'file' || !hasMetadata || fileCount !== 1 || failure) {
				failure ??= new DocumentError('invalid-request')
				stream.resume()
				return
			}
			/** Prevent a final business transaction until trailing multipart structure is validated. */
			async function* checked(): AsyncGenerator<Uint8Array> {
				for await (const chunk of stream) yield chunk as Uint8Array
				await parsed
				if (stream.truncated) throw new DocumentError('file-too-large')
				if (failure) throw failure
			}
			/** Authorize before the consumer stores the first chunk. */
			const receive = async () =>
				consume(await prepare(metadata), checked(), info.filename, info.mimeType)
			result = receive()
			void result.catch(
				/** Drain rejected input to finish parsing without an unhandled rejection. */ (error) => {
					failure = error
					request.unpipe(parser)
					parser.destroy()
					request.resume()
					finishParsing()
					stream.destroy()
				},
			)
		},
	)
	for (const event of ['partsLimit', 'filesLimit', 'fieldsLimit'] as const)
		parser.on(
			event,
			/** Reject extra parts even when the first file was valid. */ () => {
				failure = new DocumentError('invalid-request')
			},
		)
	parser.on(
		'error',
		/** Finish waiting readers on malformed or disconnected input. */ () => {
			failure ??= new DocumentError('invalid-request')
			file?.destroy(new Error('Invalid multipart input'))
			finishParsing()
		},
	)
	parser.on('close', finishParsing)
	request.once(
		'aborted',
		/** Abort partial storage without finalizing a command. */ () =>
			parser.destroy(new Error('Upload interrupted')),
	)
	request.pipe(parser)
	await parsed
	if (result) return await result
	throw failure ?? new DocumentError('invalid-request')
}
