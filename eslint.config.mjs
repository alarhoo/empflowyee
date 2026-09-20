import nx from '@nx/eslint-plugin';

const productRestrictions = [
  {
    files: ['apps/hcm/web/**/*.ts', 'libs/hcm/web/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['primeng', 'primeng/*', '@primeuix/*'], message: 'PrimeNG belongs to Console, not HCM.' },
            { group: ['@spartan-ng/*'], message: 'Spartan belongs to Account, not HCM.' },
            { group: ['@nestjs/*', 'next', 'react', 'react/*'], message: 'HCM browser code must not import server/Next/React runtime packages.' }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/account/web/**/*.ts', 'libs/account/web/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['primeng', 'primeng/*', '@primeuix/*'], message: 'PrimeNG belongs to Console, not Account.' },
            { group: ['@fundamental-ngx/*', '@ui5/*'], message: 'Fundamental/UI5 belongs to HCM, not Account.' },
            { group: ['@nestjs/*', 'next', 'react', 'react/*'], message: 'Account browser code must not import server/Next/React runtime packages.' }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/console/web/**/*.ts', 'libs/console/web/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@spartan-ng/*'], message: 'Spartan belongs to Account, not Console.' },
            { group: ['@fundamental-ngx/*', '@ui5/*'], message: 'Fundamental/UI5 belongs to HCM, not Console.' },
            { group: ['@nestjs/*', 'next', 'react', 'react/*'], message: 'Console browser code must not import server/Next/React runtime packages.' }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/marketing/web/**/*.{ts,tsx,js,jsx}', 'libs/marketing/web/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@angular/*', '@nestjs/*', 'primeng', 'primeng/*', '@primeuix/*', '@spartan-ng/*', '@fundamental-ngx/*', '@ui5/*'], message: 'Marketing is an independent Next.js product surface.' }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/**/api/**/*.ts', 'libs/**/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@angular/*', 'primeng', 'primeng/*', '@primeuix/*', '@spartan-ng/*', '@fundamental-ngx/*', '@ui5/*', 'next', 'react', 'react/*'], message: 'API projects must not import browser/UI frameworks.' }
          ]
        }
      ]
    }
  }
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.next/**', '**/.nx/**']
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            { sourceTag: 'product:hcm', onlyDependOnLibsWithTags: ['product:hcm', 'product:platform'] },
            { sourceTag: 'product:account', onlyDependOnLibsWithTags: ['product:account', 'product:platform'] },
            { sourceTag: 'product:console', onlyDependOnLibsWithTags: ['product:console', 'product:platform'] },
            { sourceTag: 'product:marketing', onlyDependOnLibsWithTags: ['product:marketing', 'product:platform'] },
            { sourceTag: 'product:platform', onlyDependOnLibsWithTags: ['product:platform'] },

            { sourceTag: 'runtime:web', onlyDependOnLibsWithTags: ['runtime:web', 'runtime:universal'] },
            { sourceTag: 'runtime:api', onlyDependOnLibsWithTags: ['runtime:api', 'runtime:universal'] },
            { sourceTag: 'runtime:universal', onlyDependOnLibsWithTags: ['runtime:universal'] },

            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:shell', 'type:feature', 'type:data-access', 'type:ui', 'type:floorplan', 'type:util', 'type:contract', 'type:domain', 'type:application', 'type:infrastructure', 'type:transport', 'type:module'] },
            { sourceTag: 'type:shell', onlyDependOnLibsWithTags: ['type:feature', 'type:data-access', 'type:ui', 'type:util', 'type:contract', 'type:floorplan'] },
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:data-access', 'type:ui', 'type:util', 'type:contract', 'type:floorplan'] },
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:util', 'type:contract'] },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:util', 'type:contract'] },
            { sourceTag: 'type:floorplan', onlyDependOnLibsWithTags: ['type:floorplan', 'type:ui', 'type:util', 'type:contract'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util', 'type:contract'] },
            { sourceTag: 'type:contract', onlyDependOnLibsWithTags: ['type:contract'] },

            { sourceTag: 'type:domain', onlyDependOnLibsWithTags: ['type:domain', 'type:contract'] },
            { sourceTag: 'type:application', onlyDependOnLibsWithTags: ['type:application', 'type:domain', 'type:contract'] },
            { sourceTag: 'type:infrastructure', onlyDependOnLibsWithTags: ['type:infrastructure', 'type:application', 'type:domain', 'type:contract', 'type:util'] },
            { sourceTag: 'type:transport', onlyDependOnLibsWithTags: ['type:transport', 'type:application', 'type:contract', 'type:util'] },
            { sourceTag: 'type:module', onlyDependOnLibsWithTags: ['type:module', 'type:transport', 'type:infrastructure', 'type:application', 'type:domain', 'type:contract', 'type:util'] }
          ]
        }
      ]
    }
  },
  ...productRestrictions
];
