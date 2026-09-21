// Reference only. Adapt inside the shared API bootstrap pattern, not separately in every API.

const port = Number(process.env.PORT ?? 8080)

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
	throw new Error('Invalid PORT')
}

// In Nest bootstrap:
// app.enableShutdownHooks();
// await app.listen(port, '0.0.0.0');
