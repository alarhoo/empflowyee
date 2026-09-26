# Job Architecture — Domain Model

Job Architecture separates reusable work definitions, HR classifications, planned seats and incumbency.

## Core concepts

| Concept | Meaning | Explicitly not |
|---|---|---|
| Job Profile | Stable reusable work identity | Position/seat or employee |
| Job Profile Version | Immutable published description of purpose, scope, responsibilities, requirements and allowed grades | Employee job history |
| Position | Stable coded planned/budgeted seat | Person or assignment |
| Position Version | Effective-dated organizational placement/capacity of a Position | Incumbency |
| Assignment | Workforce Foundation fact that a person/employment occupies work | Position definition |
| Designation | Display title | Job profile, grade, band or authorization |
| Job Level | Scope/autonomy step in a career track | Grade or salary band |
| Job Grade | Ordered HR classification | Salary amount |
| Job Band | Non-monetary grouping of grades | Compensation range |

## Relationships

```mermaid
erDiagram
  JOB_CATALOGUE ||--|{ JOB_CATALOGUE_VERSION : versions
  JOB_CATALOGUE_VERSION ||--o{ JOB_FAMILY : structures
  JOB_CATALOGUE_VERSION ||--o{ CAREER_TRACK : defines
  CAREER_TRACK ||--o{ JOB_LEVEL : sequences
  JOB_CATALOGUE_VERSION ||--o{ JOB_BAND : groups
  JOB_BAND ||--o{ JOB_GRADE : contains
  JOB_PROFILE ||--|{ JOB_PROFILE_VERSION : versions
  JOB_PROFILE_VERSION ||--o{ JOB_PROFILE_RESPONSIBILITY : describes
  JOB_PROFILE_VERSION ||--o{ JOB_PROFILE_REQUIREMENT : requires
  JOB_PROFILE_VERSION ||--|{ JOB_PROFILE_GRADE : allows
  POSITION ||--|{ POSITION_VERSION : versions
  JOB_PROFILE_VERSION ||--o{ POSITION_VERSION : defines
  POSITION_VERSION ||--o{ POSITION_REQUIREMENT : specializes
  POSITION ||--o{ POSITION_RELATIONSHIP : hierarchy
```

## Incumbency

Assignment owns incumbency. Position does not store a person/worker. Remaining capacity is derived from the effective Position Version minus effective Assignment occupancy. If occupancy cannot be established completely, the system must not silently interpret it as zero.

## Publication/versioning

Published catalogue, job-profile and position versions are immutable. Corrections create successor versions. Effective ranges for versions of the same stable aggregate do not overlap.

## HCM-2 applications

- `JOB_CATALOGUE`
- `POSITIONS`
- `POSITION_REQUIREMENTS`
