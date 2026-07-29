import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import {
  StorybookPageProvider,
  createStorybookPageProvider,
  usePage,
  Link,
  Form,
  Head,
  Deferred,
  router,
  useForm,
  http,
  progress,
  createInertiaApp,
} from "./index"

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ShowProp({ name }: { name: string }) {
  const page = usePage()
  return <span data-testid="value">{String(page.props[name] ?? "")}</span>
}

describe("usePage / StorybookPageProvider", () => {
  it("falls back to the base page outside a provider", () => {
    function ShowUrl() {
      const page = usePage()
      return <span data-testid="url">{page.url}</span>
    }
    render(<ShowUrl />)
    expect(screen.getByTestId("url")).toHaveTextContent("/")
  })

  it("surfaces story-supplied props", () => {
    render(
      <StorybookPageProvider page={{ props: { title: "Hello" } }}>
        <ShowProp name="title" />
      </StorybookPageProvider>,
    )
    expect(screen.getByTestId("value")).toHaveTextContent("Hello")
  })

  it("merges story props over the base page rather than replacing it", () => {
    function ShowComponent() {
      const page = usePage()
      return <span data-testid="component">{page.component}</span>
    }
    render(
      <StorybookPageProvider page={{ props: { a: 1 } }}>
        <ShowComponent />
      </StorybookPageProvider>,
    )
    // `component` came from the base page, not the story.
    expect(screen.getByTestId("component")).toHaveTextContent("Storybook")
  })
})

describe("createStorybookPageProvider", () => {
  it("injects app-specific shared props", () => {
    const Provider = createStorybookPageProvider({
      defaultProps: { supportEmail: "support@example.com" },
    })
    render(
      <Provider page={{ props: {} }}>
        <ShowProp name="supportEmail" />
      </Provider>,
    )
    expect(screen.getByTestId("value")).toHaveTextContent("support@example.com")
  })

  it("lets story props win over injected defaults", () => {
    const Provider = createStorybookPageProvider({
      defaultProps: { supportEmail: "default@example.com" },
    })
    render(
      <Provider page={{ props: { supportEmail: "story@example.com" } }}>
        <ShowProp name="supportEmail" />
      </Provider>,
    )
    expect(screen.getByTestId("value")).toHaveTextContent("story@example.com")
  })

  it("supports a nested shared object such as an auth profile", () => {
    const Provider = createStorybookPageProvider({
      defaultProps: { auth: { scopes: ["admin:full"], profileActive: true } },
    })
    function ShowScope() {
      const page = usePage<{ auth?: { scopes?: string[] } }>()
      return <span data-testid="scope">{page.props.auth?.scopes?.[0]}</span>
    }
    render(
      <Provider page={{ props: {} }}>
        <ShowScope />
      </Provider>,
    )
    expect(screen.getByTestId("scope")).toHaveTextContent("admin:full")
  })

  it("defaults to no injected props when called bare", () => {
    const Provider = createStorybookPageProvider()
    render(
      <Provider page={{ props: { title: "x" } }}>
        <ShowProp name="title" />
      </Provider>,
    )
    expect(screen.getByTestId("value")).toHaveTextContent("x")
  })
})

describe("Link", () => {
  it("renders an anchor and suppresses navigation", async () => {
    const user = userEvent.setup()
    render(<Link href="/somewhere">Go</Link>)
    const anchor = screen.getByRole("link", { name: "Go" })
    expect(anchor).toHaveAttribute("href", "/somewhere")
    await user.click(anchor)
    expect(console.info).toHaveBeenCalledWith(
      "[storybook] Link clicked",
      expect.objectContaining({ href: "/somewhere" }),
    )
  })

  it("still invokes a caller-supplied onClick", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Link href="/x" onClick={onClick}>
        Go
      </Link>,
    )
    await user.click(screen.getByRole("link"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe("Form", () => {
  it("renders a form and swallows submits", async () => {
    const user = userEvent.setup()
    render(
      <Form action="/login" method="post">
        <button type="submit">Submit</button>
      </Form>,
    )
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(console.info).toHaveBeenCalledWith(
      "[storybook] Form submit",
      expect.objectContaining({ action: "/login" }),
    )
  })

  // Union behaviour #1 — luminality-web filtered non-DOM props, sidekick-web
  // did not. Unfiltered, these reach the DOM and React warns.
  it("keeps Inertia-only props off the DOM element", () => {
    const { container } = render(
      <Form action="/x" transform={() => {}} onSuccess={() => {}} options={{}} className="card">
        <span>body</span>
      </Form>,
    )
    const form = container.querySelector("form")!
    expect(form).toHaveClass("card")
    expect(form.getAttribute("transform")).toBeNull()
    expect(form.getAttribute("options")).toBeNull()
    expect(form.getAttribute("onSuccess")).toBeNull()
  })

  it("passes through aria-, data- and role attributes", () => {
    const { container } = render(
      <Form aria-label="Sign in" data-testid="signin" role="form">
        <span>body</span>
      </Form>,
    )
    const form = container.querySelector("form")!
    expect(form).toHaveAttribute("aria-label", "Sign in")
    expect(form).toHaveAttribute("data-testid", "signin")
    expect(form).toHaveAttribute("role", "form")
  })

  // Union behaviour #2 — sidekick-web supported the render-prop child,
  // luminality-web did not.
  it("supports a render-prop child receiving form helpers", () => {
    render(
      <Form action="/x">
        {(helpers) => <span data-testid="processing">{String(helpers.processing)}</span>}
      </Form>,
    )
    expect(screen.getByTestId("processing")).toHaveTextContent("false")
  })

  // Union behaviour #3 — luminality-web's allowlist silently dropped onSubmit.
  it("forwards a caller-supplied onSubmit", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <Form action="/x" onSubmit={onSubmit}>
        <button type="submit">Go</button>
      </Form>,
    )
    await user.click(screen.getByRole("button"))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("Head", () => {
  it("sets and restores document.title", () => {
    document.title = "original"
    const { unmount } = render(<Head title="Story title" />)
    expect(document.title).toBe("Story title")
    unmount()
    expect(document.title).toBe("original")
  })

  it("leaves the title alone when none is given", () => {
    document.title = "untouched"
    render(<Head />)
    expect(document.title).toBe("untouched")
  })

  it("renders nothing", () => {
    const { container } = render(<Head title="x" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe("Deferred", () => {
  it("renders children rather than the fallback", () => {
    render(
      <Deferred data="items" fallback={<span>loading</span>}>
        <span data-testid="resolved">resolved</span>
      </Deferred>,
    )
    expect(screen.getByTestId("resolved")).toBeInTheDocument()
    expect(screen.queryByText("loading")).not.toBeInTheDocument()
  })
})

describe("router", () => {
  it.each(["get", "post", "put", "patch", "delete", "visit", "reload", "replace"] as const)(
    "logs router.%s without touching the network",
    (method) => {
      router[method]("/target")
      expect(console.info).toHaveBeenCalledWith(
        `[storybook] router.${method}`,
        expect.objectContaining({ url: "/target" }),
      )
    },
  )

  it("returns an unsubscribe function from on()", () => {
    expect(typeof router.on()).toBe("function")
  })

  it("exposes remember/restore as no-ops", () => {
    expect(router.remember()).toBeUndefined()
    expect(router.restore()).toBeUndefined()
  })
})

describe("useForm", () => {
  function Harness() {
    const form = useForm<{ email: string; name: string }>({ email: "", name: "" })
    const [mode, setMode] = useState<string>("")
    return (
      <div>
        <span data-testid="email">{form.data.email}</span>
        <span data-testid="name">{form.data.name}</span>
        <span data-testid="processing">{String(form.processing)}</span>
        <span data-testid="isDirty">{String(form.isDirty)}</span>
        <span data-testid="error">{form.errors.email ?? ""}</span>
        <button onClick={() => form.setData("email", "a@b.c")}>key-value</button>
        <button onClick={() => form.setData({ name: "Ada" })}>object</button>
        <button onClick={() => form.setData((d) => ({ ...d, name: d.name + "!" }))}>updater</button>
        <button onClick={() => form.setError("email", "is invalid")}>set-error</button>
        <button onClick={() => form.clearErrors()}>clear-errors</button>
        <button onClick={() => form.reset()}>reset</button>
        <button
          onClick={() => {
            form.post("/submit")
            setMode("posted")
          }}
        >
          post
        </button>
        <span data-testid="mode">{mode}</span>
      </div>
    )
  }

  it("supports setData(key, value)", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "key-value" }))
    expect(screen.getByTestId("email")).toHaveTextContent("a@b.c")
  })

  it("supports setData(object)", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "object" }))
    expect(screen.getByTestId("name")).toHaveTextContent("Ada")
  })

  it("supports setData(updater)", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "object" }))
    await user.click(screen.getByRole("button", { name: "updater" }))
    expect(screen.getByTestId("name")).toHaveTextContent("Ada!")
  })

  it("sets and clears errors", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "set-error" }))
    expect(screen.getByTestId("error")).toHaveTextContent("is invalid")
    await user.click(screen.getByRole("button", { name: "clear-errors" }))
    expect(screen.getByTestId("error")).toHaveTextContent("")
  })

  it("resets to the initial data", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "key-value" }))
    await user.click(screen.getByRole("button", { name: "reset" }))
    expect(screen.getByTestId("email")).toHaveTextContent("")
  })

  // Present only in sidekick-web's mock; components reading it crashed nothing
  // but were untypeable elsewhere in the estate.
  it("exposes isDirty", () => {
    render(<Harness />)
    expect(screen.getByTestId("isDirty")).toHaveTextContent("false")
  })

  it("toggles processing for the submit simulation and clears it", async () => {
    vi.useFakeTimers()
    try {
      render(<Harness />)
      const button = screen.getByRole("button", { name: "post" })
      act(() => {
        button.click()
      })
      expect(screen.getByTestId("processing")).toHaveTextContent("true")
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(screen.getByTestId("processing")).toHaveTextContent("false")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("compatibility shims", () => {
  it("exposes http listener no-ops", () => {
    expect(http.onRequest()).toBeUndefined()
    expect(http.onResponse()).toBeUndefined()
    expect(http.onError()).toBeUndefined()
  })

  // `@inertiaui/modal-react` imports `progress` from `@inertiajs/react`; a
  // missing export breaks the whole preview, not just one story.
  it("exposes the progress helper the modal package imports", () => {
    expect(progress.isVisible()).toBe(false)
    expect(progress.init()).toBeUndefined()
    expect(progress.start()).toBeUndefined()
    expect(progress.set()).toBeUndefined()
    expect(progress.finish()).toBeUndefined()
    expect(progress.config()).toBeUndefined()
  })

  it("throws a clear error if createInertiaApp is called", () => {
    expect(() => createInertiaApp()).toThrow(/not available in Storybook/)
  })
})
