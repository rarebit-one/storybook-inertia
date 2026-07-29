# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-29

Initial release. Extracts the Storybook `@inertiajs/react` mock that had been
hand-written four times across the estate (fundbright-web, luminality-web,
sidekick-web, sidekick-harness) into one shared, tested package.

### Added

- `usePage`, `StorybookPageProvider`, `Link`, `Head`, `Deferred`, `router`,
  `useForm`, `http`, `progress`, `createInertiaApp` — the API surface all four
  prior mocks implemented in common.
- `createStorybookPageProvider({ defaultProps })` for injecting app-specific
  shared props (a `supportEmail` that `inertia_share` puts on every response, an
  `auth` profile that layout chrome gates on) without forking the mock.
- `Form`, as the union of the two independent implementations that existed: it
  filters non-DOM props off the element, supports render-prop children, and
  forwards a caller-supplied `onSubmit`. No prior implementation did all three.
- `useForm().isDirty`, previously present in only one of the four mocks.

### Notes

The `Form` and `isDirty` additions are **preventive rather than bug fixes**: no
call site in the estate exercised the gaps at the time of extraction, so these
close latent traps rather than repairing shipping defects.

`Link` intentionally keeps the one wart shared by all four prior mocks — it
spreads unknown props onto the `<a>` verbatim — so that adopting this package is
a provably behaviour-neutral swap for existing story suites.

[0.1.0]: https://github.com/rarebit-one/storybook-inertia/releases/tag/v0.1.0
