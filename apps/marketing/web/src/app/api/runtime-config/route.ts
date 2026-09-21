import { parseNodeRuntimeConfig } from '@empflowyee/platform-runtime-contract'

export const dynamic = 'force-dynamic'

/** Read approved public metadata at request time without serializing other server environment values. */
export function GET() {
	const { environment, releaseId } = parseNodeRuntimeConfig(process.env, 4200)
	return Response.json({ environment, releaseId }, { headers: { 'Cache-Control': 'no-store' } })
}
