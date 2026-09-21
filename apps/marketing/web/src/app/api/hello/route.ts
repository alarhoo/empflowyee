/** Return the scaffold plain-text greeting for GET /api/hello. */
export async function GET(_request: Request) {
	return new Response('Hello, from API!')
}
