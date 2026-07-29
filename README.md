# @rarebit-one/storybook-inertia

A Storybook mock of [`@inertiajs/react`](https://inertiajs.com), so page components render in Storybook with no backend, no router and no HTTP.

Alias `@inertiajs/react` to this package in your Storybook Vite config and components calling `usePage()`, `<Link>`, `<Form>`, `useForm()` or `router` render as themselves.

## Why this exists

Inertia page components import from `@inertiajs/react`. Some of that surface is context-free and works unmocked — `useForm` is plain `useState`/`useRef` under the hood, so a form page stories fine with no setup at all. **The parts that need a mock are the ones that reach for page context or the router: `usePage()` and `<Link>`.** Those are exactly what application _chrome_ uses.

That distinction decides whether a mock is worth having. In `jumpdrive-web/control-plane`, of the files importing `@inertiajs/react` that had no story:

- **29 were blocked** on `usePage` / `Link` / `router` / `Head`
- **3 used only `useForm`** and were storyable already

The blocked set is the console shell — `Layout.tsx` plus the `OrgSwitcher` / `UserMenu` / `WorkspaceHeader` / `ApprovalRow` / `FlashBanner` / `ConnectorCards` chrome cluster — and the 25 console and settings pages that render inside it. So this package unblocks **page-level rendering**, not just form widgets. That is the difference between it being worth building and not.

It also replaces four independently hand-written mocks (fundbright-web, luminality-web, sidekick-web, sidekick-harness) that had drifted into three different partial implementations of the same API.

## Install

```bash
npm install --save-dev @rarebit-one/storybook-inertia
```

`react` is a peer dependency (>= 18); the package externalises React so stories share the consumer's single React instance.

## Usage

Keep a thin local shim at `.storybook/inertia-mock.tsx` and point the alias at it. This is what lets each app inject its own shared props while everything else comes from the package:

```tsx
// .storybook/inertia-mock.tsx
import { createStorybookPageProvider } from "@rarebit-one/storybook-inertia"

export * from "@rarebit-one/storybook-inertia"

// An explicit local export legally shadows the matching `export *` name.
export const StorybookPageProvider = createStorybookPageProvider({
  defaultProps: { supportEmail: "support@example.com" },
})
```

```ts
// .storybook/main.ts
config.resolve.alias = {
  ...(config.resolve.alias ?? {}),
  "@inertiajs/react": resolve(here, "inertia-mock.tsx"),
}
```

```tsx
// .storybook/preview.tsx
import { StorybookPageProvider } from "./inertia-mock"

const withProviders: Decorator = (Story, context) => {
  const inertia =
    (context.parameters as { inertia?: { props?: Record<string, unknown> } }).inertia ?? {}
  return (
    <StorybookPageProvider page={{ props: inertia.props ?? {} }}>
      <Story />
    </StorybookPageProvider>
  )
}
```

Stories then supply page state as a parameter:

```tsx
export const Default: Story = {
  parameters: { inertia: { props: { user: { name: "Ada" } } } },
}
```

If your app needs no shared props, skip the factory entirely and alias straight at the package.

### Prop precedence

`story props` > `defaultProps` (from `createStorybookPageProvider`) > package base (`{ flash: {} }`, `url: "/"`, `component: "Storybook"`, `version: null`).

## API

Everything below is exported, mirroring the shape of `@inertiajs/react`:

| Export                                          | Behaviour                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `usePage()`                                     | Returns the page from context. Generic over your props type.                                                         |
| `StorybookPageProvider`                         | Provides page state. Merges over the package base.                                                                   |
| `createStorybookPageProvider({ defaultProps })` | Builds a provider pre-seeded with app-specific shared props.                                                         |
| `Link`                                          | Renders an `<a>`, prevents navigation, logs the click, still calls your `onClick`.                                   |
| `Form`                                          | Renders a `<form>` that swallows submits. Filters non-DOM props, supports render-prop children, forwards `onSubmit`. |
| `useForm(initial)`                              | Real local state. All three `setData` forms, `errors`, `reset`, `isDirty`, and a `processing` flash on submit.       |
| `Head`                                          | Sets `document.title` and restores it on unmount. Renders nothing.                                                   |
| `Deferred`                                      | Renders `children` (stories pass deferred props concretely).                                                         |
| `router`                                        | `get/post/put/patch/delete/visit/reload/replace` log to the console. No network.                                     |
| `http`, `progress`                              | No-op shims. `progress` is imported by `@inertiaui/modal-react`, so it must exist or the whole preview breaks.       |
| `createInertiaApp`                              | Throws — it has no meaning in Storybook.                                                                             |

### MSW compatibility

Nothing here touches the network — `router` methods only `console.info`. The mock composes with MSW-based story suites without interfering with request interception or settle logic.

## Notes on the merged implementation

The four mocks this replaces had each solved a slightly different subset. The union is documented here so nothing looks accidental:

- **`Form` prop filtering.** Non-DOM props Inertia accepts (`transform`, `options`, `onSuccess`, `onError`, …) are kept off the DOM element; `aria-*`, `data-*` and `role` pass through.
- **`Form` render-prop children.** `<Form>{(helpers) => …}</Form>` is supported.
- **`Form` `onSubmit` forwarding.** A caller-supplied `onSubmit` runs after the default is prevented.
- **`useForm().isDirty`.** Present, so components reading it type-check everywhere.

These are **preventive**, not bug fixes: no call site in the estate exercised the gaps at the time of extraction. They remove latent traps rather than repairing shipping defects.

One wart is deliberately **preserved**: `Link` spreads unknown props onto the `<a>` verbatim, exactly as all four prior mocks did, so adopting this package is a provably behaviour-neutral swap. Filtering them is a separate, independently-verifiable change.

## Development

```bash
npm install
npm test          # vitest, jsdom
npm run check     # tsc --noEmit
npm run lint
npm run build     # vite lib build + rolled-up .d.ts
npm run verify:dts
```

`verify:dts` is the publish guard: it refuses a declaration build that is an empty `export { }` stub or is missing any public symbol. It exists because a sibling package was once tagged and never publishable for exactly that reason.

## Releasing

1. Bump `version` in `package.json` and add a matching `CHANGELOG.md` entry.
2. Merge to `main`, then push a `v<version>` tag.
3. `release.yml` creates the GitHub Release using a GitHub App token — **not** `GITHUB_TOKEN`, which GitHub suppresses workflow triggers for.
4. The published Release fires `publish.yml`, which publishes to npm via OIDC trusted publishing with provenance.

## License

MIT
