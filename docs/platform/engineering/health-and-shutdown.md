# Health and shutdown contract

## Cloud Run contract

Node services listen on the injected `PORT` and bind to all interfaces.

## Static web

The NGINX template exposes:

```text
/health/live
/health/ready
```

Both mean the static server has started and can serve files.

## APIs

Expose:

```text
/health/live
/health/ready
```

### Liveness

No database query. No external provider call. The purpose is to determine whether the process is capable of serving HTTP.

### Readiness

May validate critical dependencies using strict timeouts. Do not make readiness depend on optional providers.

## Graceful shutdown

NestJS must enable shutdown hooks and stop accepting new work when Cloud Run sends SIGTERM. Background work must either finish inside the shutdown window or be designed as durable asynchronous work rather than fire-and-forget HTTP-process state.
