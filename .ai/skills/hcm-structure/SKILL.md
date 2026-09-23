# Materialize HCM codebase structure

Use `node tools/hcm-factory/materialize-hcm-structure.mjs` to create the complete planned HCM directory tree for visualization.

Important:

- the script validates canonical metadata, creates empty directories and refreshes only the generated codebase map;
- empty directories are not Nx projects;
- do not add project configuration merely because a planned folder exists;
- when implementation starts, use approved Nx generators in the planned path;
- never reorganize folders according to Launchpad Spaces/Pages.
