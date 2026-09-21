export const dynamic = 'force-dynamic'

/** Report that the Next server can respond without consulting external services. */
export function GET() {
	return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
