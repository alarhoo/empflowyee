import { parseNodeRuntimeConfig } from '@empflowyee/platform-runtime-contract'

export const dynamic = 'force-dynamic'

/** Confirm that runtime configuration is valid before accepting application traffic. */
export function GET() {
	parseNodeRuntimeConfig(process.env, 4200)
	return Response.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } })
}
