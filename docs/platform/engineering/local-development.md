# Local Development

## Frontend ports

| Project | Port | Intended local URL |
| --- | ---: | --- |
| marketing-web | 4200 | `http://empflowyee.com:4200` |
| account-web | 4300 | `http://account.empflowyee.com:4300` |
| console-web | 4301 | `http://console.empflowyee.com:4301` |
| hcm-web | 4302 | `http://acme.empflowyee.com:4302` |

## API ports

| Project | Port |
| --- | ---: |
| account-api | 4400 |
| console-api | 4401 |
| hcm-api | 4402 |

## Hosts file

For the named frontend URLs, add development-only host mappings:

```text
127.0.0.1 empflowyee.com
127.0.0.1 account.empflowyee.com
127.0.0.1 console.empflowyee.com
127.0.0.1 acme.empflowyee.com
```

A hosts file does not support wildcard domains. Add specific tenant examples as required, or introduce a local DNS solution later.

## Commands

```bash
pnpm dev:marketing
pnpm dev:account
pnpm dev:console
pnpm dev:hcm

pnpm dev:account-api
pnpm dev:console-api
pnpm dev:hcm-api
```
