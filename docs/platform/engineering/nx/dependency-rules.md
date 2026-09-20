# Nx Dependency Rules

The root `eslint.config.mjs` is the executable version of this document.

## Product direction

```text
marketing -> marketing + platform
account   -> account   + platform
hcm       -> hcm       + platform
console   -> console   + platform
platform  -> platform only
```

Products do not import each other's implementation.

## Runtime direction

```text
runtime:web       -> web + universal
runtime:api       -> api + universal
runtime:universal -> universal only
```

## Frontend layering

```text
app
 |
shell
 |
feature
 |---- data-access
 |---- ui
 |---- floorplan
 |---- contract
 `---- util
```

Feature libraries do not import other feature libraries.

## Backend layering

```text
domain          -> domain + contract
application     -> application + domain + contract
infrastructure  -> infrastructure + application + domain + contract + util
transport       -> transport + application + contract + util
module          -> module + transport + infrastructure + application + domain + contract + util
```

Domain/application layers must not know database/HTTP implementation details.

## External UI package ownership

Nx module-boundary tags govern workspace project imports, but external npm packages are root dependencies in the integrated workspace. Therefore ESLint also enforces product-specific external package restrictions:

- HCM cannot import PrimeNG/Spartan.
- Account cannot import PrimeNG/Fundamental/UI5.
- Console cannot import Spartan/Fundamental/UI5.
- Marketing cannot import Angular/Nest/product UI libraries.
- API code cannot import browser UI frameworks.

This prevents a root dependency from becoming an architectural loophole.

## Application roots

`type:app` projects are composition/deployment roots. They may depend on approved libraries for their runtime and product, but never on another `type:app` project. Reusable implementation must move to `libs/`.
