# CI/CD credential and state exclusions

The exclusions are integrated into [.gitignore](.gitignore) and
[.dockerignore](.dockerignore). They cover temporary Google authentication
credentials, Terraform local state/plans/variable values, and local environment
files. Keep Terraform lock files and sanitized example configuration in source.

The Docker build context is the monorepo root. Future Dockerfiles must preserve
these exclusions so generated credentials cannot enter an image.
