// Probe process responsiveness without printing response contents or environment values.
try {
	const response = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/health/live`, {
		signal: AbortSignal.timeout(2000),
	})
	process.exitCode = response.ok ? 0 : 1
} catch {
	process.exitCode = 1
}
