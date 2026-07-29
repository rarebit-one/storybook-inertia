/**
 * Storybook mock of `@inertiajs/react`.
 *
 * Consumers alias `@inertiajs/react` to a thin local shim that re-exports this
 * module, so page components calling `usePage()` / `<Link>` / `router` render
 * in Storybook with no backend, no router and no HTTP.
 *
 * Nothing here touches the network: `router` methods only `console.info`, so
 * the mock composes with MSW-based suites without interfering with request
 * interception or settle logic.
 */

import {
  createContext,
  use,
  useState,
  useCallback,
  useEffect,
  type AnchorHTMLAttributes,
  type FormHTMLAttributes,
  type ReactNode,
} from "react"

export interface InertiaPageProps {
  [key: string]: unknown
  flash?: { notice?: string | null; alert?: string | null; error?: string | null }
}

export interface InertiaPage {
  props: InertiaPageProps
  url: string
  component: string
  version: string | null
}

/**
 * Base page used when a story renders outside a provider, and as the merge
 * floor for every provider. App-specific seeds (a shared `auth` profile, a
 * `supportEmail` that `inertia_share` puts on every real response) are NOT
 * baked in here — they are injected per consumer via
 * `createStorybookPageProvider({ defaultProps })`.
 */
const basePage: InertiaPage = {
  props: { flash: {} },
  url: "/",
  component: "Storybook",
  version: null,
}

const PageContext = createContext<InertiaPage>(basePage)

export interface StorybookPageProviderProps {
  page: Partial<InertiaPage>
  children: ReactNode
}

function mergePage(page: Partial<InertiaPage>, defaultProps: InertiaPageProps): InertiaPage {
  return {
    ...basePage,
    ...page,
    props: { ...basePage.props, ...defaultProps, ...(page.props ?? {}) },
  }
}

/** Provider seeded only with the package defaults. */
export function StorybookPageProvider({ page, children }: StorybookPageProviderProps) {
  return <PageContext.Provider value={mergePage(page, {})}>{children}</PageContext.Provider>
}

/**
 * Build a `StorybookPageProvider` pre-seeded with app-specific shared props.
 *
 * Story-supplied props always win over `defaultProps`, which in turn win over
 * the package base. Consumers shadow the plain export with this one:
 *
 *   export * from "@rarebit-one/storybook-inertia"
 *   export const StorybookPageProvider = createStorybookPageProvider({
 *     defaultProps: { supportEmail: "support@example.com" },
 *   })
 *
 * An explicit local export legally shadows a matching `export *` name.
 */
export function createStorybookPageProvider({
  defaultProps = {},
}: { defaultProps?: InertiaPageProps } = {}) {
  return function StorybookPageProvider({ page, children }: StorybookPageProviderProps) {
    return (
      <PageContext.Provider value={mergePage(page, defaultProps)}>{children}</PageContext.Provider>
    )
  }
}

export function usePage<TProps extends InertiaPageProps = InertiaPageProps>(): InertiaPage & {
  props: TProps
} {
  const page = use(PageContext)
  return page as InertiaPage & { props: TProps }
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  method?: string
  as?: string
  data?: Record<string, unknown>
  preserveScroll?: boolean
  preserveState?: boolean
  only?: string[]
  headers?: Record<string, string>
}

// NOTE: `rest` is spread onto the `<a>` verbatim, exactly as all four estate
// mocks did. Inertia-only props (`as`, `data`, `preserveScroll`, …) therefore
// still reach the DOM if a caller passes them. That is a latent wart shared by
// every prior implementation, deliberately preserved here so adopting this
// package is a provably behaviour-neutral swap. Filtering them is a separate,
// independently-verifiable change.
export function Link({ href, method, onClick, children, ...rest }: LinkProps) {
  return (
    <a
      href={href}
      onClick={(e) => {
        // react-doctor-disable-next-line react-doctor/no-prevent-default
        // Intentional: this mock intercepts navigation in the Storybook iframe.
        e.preventDefault()
        console.info("[storybook] Link clicked", { href, method })
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

// `<Deferred data="x">` defers a prop until a follow-up request resolves it,
// showing `fallback` meanwhile. Storybook has no second request — screen
// stories pass the deferred prop concretely to the page — so the prop is
// always "resolved" and we render `children` directly (the `data` / `fallback`
// props exist only to match Inertia's signature).
export function Deferred({
  children,
}: {
  data: string | string[]
  fallback: ReactNode
  children: ReactNode
}) {
  return <>{children}</>
}

/**
 * Props safe to spread onto a DOM `<form>`. Inertia's `<Form>` accepts
 * non-DOM props (`transform`, `onSuccess`, `resetOnSuccess`,
 * `disableWhileProcessing`, `options`, …) which React would warn about as
 * unknown attributes. `aria-*` / `data-*` pass through by prefix.
 */
const FORM_DOM_PROPS = new Set([
  "className",
  "style",
  "id",
  "name",
  "autoComplete",
  "noValidate",
  "target",
  "encType",
  "acceptCharset",
  "role",
  "tabIndex",
])

type FormHelpers = ReturnType<typeof useForm<Record<string, unknown>>>

type InertiaFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method"> & {
  action?: string
  method?: string
  /** Inertia's `<Form>` supports a render-prop child receiving form helpers. */
  children?: ReactNode | ((helpers: FormHelpers) => ReactNode)
  transform?: unknown
  options?: unknown
  onSuccess?: () => void
  onError?: () => void
}

/**
 * `<Form action method>` posts to the backend in production. Stories don't
 * navigate, so we render a plain `<form>` that swallows submits and logs.
 *
 * This is the union of the two independently-written implementations in the
 * estate: it filters non-DOM props onto the element (so React never warns) AND
 * supports the render-prop child form AND forwards a consumer `onSubmit`.
 * Neither prior implementation did all three.
 */
export function Form({ action, method, children, onSubmit, ...rest }: InertiaFormProps) {
  const helpers = useForm<Record<string, unknown>>({})
  const domProps = Object.fromEntries(
    Object.entries(rest).filter(
      ([key]) => FORM_DOM_PROPS.has(key) || key.startsWith("aria-") || key.startsWith("data-"),
    ),
  )
  return (
    <form
      action={action}
      method={method}
      onSubmit={(e) => {
        e.preventDefault()
        console.info("[storybook] Form submit", { action, method })
        onSubmit?.(e)
      }}
      {...domProps}
    >
      {typeof children === "function" ? children(helpers) : children}
    </form>
  )
}

export function Head({ title }: { children?: ReactNode; title?: string }) {
  // Restore the previous title on unmount so navigating between stories
  // doesn't leak the last-rendered title into the iframe tab.
  useEffect(() => {
    if (typeof document === "undefined" || !title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
  // Render nothing — the Storybook iframe doesn't need <Head> output.
  return null
}

type RouterFn = (url: string, data?: unknown, options?: unknown) => void

function logCall(method: string): RouterFn {
  return (url, data, options) => {
    console.info(`[storybook] router.${method}`, { url, data, options })
  }
}

export const router = {
  get: logCall("get"),
  post: logCall("post"),
  put: logCall("put"),
  patch: logCall("patch"),
  delete: logCall("delete"),
  visit: logCall("visit"),
  reload: logCall("reload"),
  replace: logCall("replace"),
  on: () => () => {},
  remember: () => {},
  restore: () => undefined,
}

interface FormDataLike {
  [key: string]: unknown
}

// Mirrors Inertia's three setData calling forms:
//   setData(key, value)
//   setData(object)
//   setData((data) => next)
interface SetDataFn<T> {
  <K extends keyof T>(key: K, value: T[K]): void
  (values: Partial<T>): void
  (updater: (current: T) => T): void
}

export function useForm<T extends FormDataLike>(initial: T) {
  const [data, setData] = useState<T>(initial)
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})

  const setField = useCallback((keyOrValuesOrUpdater: unknown, value?: unknown) => {
    if (typeof keyOrValuesOrUpdater === "function") {
      setData((d) => (keyOrValuesOrUpdater as (current: T) => T)(d))
    } else if (typeof keyOrValuesOrUpdater === "string") {
      setData((d) => ({ ...d, [keyOrValuesOrUpdater]: value }))
    } else {
      setData((d) => ({ ...d, ...(keyOrValuesOrUpdater as Partial<T>) }))
    }
  }, []) as SetDataFn<T>

  const submit = useCallback(
    (method: string, url: string) => {
      console.info(`[storybook] useForm.${method}`, { url, data })
      setProcessing(true)
      setTimeout(() => setProcessing(false), 600)
    },
    [data],
  )

  return {
    data,
    setData: setField,
    errors,
    setError: (key: keyof T, value: string) => setErrors((e) => ({ ...e, [key]: value })),
    clearErrors: () => setErrors({}),
    processing,
    progress: null,
    wasSuccessful: false,
    recentlySuccessful: false,
    isDirty: false,
    reset: () => setData(initial),
    transform: () => {},
    get: (url: string) => submit("get", url),
    post: (url: string) => submit("post", url),
    put: (url: string) => submit("put", url),
    patch: (url: string) => submit("patch", url),
    delete: (url: string) => submit("delete", url),
    submit,
  }
}

export const http = {
  onRequest: () => {},
  onResponse: () => {},
  onError: () => {},
}

// `@inertiaui/modal-react` imports `progress` (an NProgress-style helper) from
// `@inertiajs/react`. Stories don't navigate, so all methods are no-ops.
export const progress = {
  init: () => {},
  start: () => {},
  set: () => {},
  finish: () => {},
  isVisible: () => false,
  config: () => {},
}

export type ResolvedComponent = unknown

export const createInertiaApp = () => {
  throw new Error("createInertiaApp is not available in Storybook")
}
