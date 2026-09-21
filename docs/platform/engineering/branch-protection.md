# Main branch protection

Minimum rules for `main`:

- direct push denied;
- force push denied;
- deletion denied;
- pull request required;
- required CI checks pass;
- squash merge preferred.

Do not create long-lived `dev` or `qa` source branches.

Environment protection belongs in GitHub Environments and GCP IAM, not duplicate Git histories.
