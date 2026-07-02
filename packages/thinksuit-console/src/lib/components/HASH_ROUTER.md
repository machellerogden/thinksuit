# HashRouter

A small, dependency-free client-side router for Svelte 5 apps that use the URL
hash (`#/...`) for navigation. It maps hash paths to components, supports route
params, guards, resolvers, and nested (child) routers.

Files:
- `HashRouter.svelte` — the top-level router. Mount it exactly once per app.
- `ChildHashRouter.svelte` — a nested router that resolves paths *relative* to a
  matched parent route.

## Why hash routing

Hash routing keeps all navigation state after the `#`, so it works without any
server-side route configuration — the server only ever serves one document, and
the client owns everything past the `#`. That makes it a good fit for a
single-page app served as static assets.

## Quick start

Define a route table as a `Map` of `[routeConfig, Component]` entries, then mount
the router:

```svelte
<script>
    import HashRouter from '$lib/components/HashRouter.svelte';
    import Home from './Home.svelte';
    import ArticleList from './ArticleList.svelte';
    import ArticleDetail from './ArticleDetail.svelte';
    import NotFound from './NotFound.svelte';

    const routes = new Map([
        ['/', Home],
        ['/articles', ArticleList],
        ['/articles/:id', ArticleDetail],
        ['*', NotFound] // catch-all, keep last
    ]);
</script>

<HashRouter {routes} />
```

The matched component is rendered with a single `params` prop:

```svelte
<!-- ArticleDetail.svelte -->
<script>
    let { params } = $props();
</script>

<h1>Article {params.id}</h1>
```

## Route configuration

Each map key is either a **path string** or a **config object**.

### Path strings

| Pattern        | Matches                          | Notes                                  |
| -------------- | -------------------------------- | -------------------------------------- |
| `/about`       | exactly `/about`                 | literal match                          |
| `/users/:id`   | `/users/42`                      | `:id` becomes `params.id`              |
| `/files/*`     | `/files`, `/files/a/b/c`         | prefix wildcard — matches sub-paths    |
| `*`            | anything                         | catch-all; place it last               |

Multiple params work as expected: `/org/:org/repo/:repo` yields
`params.org` and `params.repo`. The **first matching entry wins**, so order
matters — put specific routes before wildcards.

### Config objects

Use an object when you need a guard or resolver:

```js
const routes = new Map([
    [
        {
            path: '/admin/:section',
            guard: (location, params) => isAuthenticated(),
            resolver: async (location, params) => {
                const section = await loadSection(params.section);
                return { ...params, section };
            }
        },
        AdminPanel
    ]
]);
```

- **`guard(location, params)`** → truthy to allow the route, falsy to skip it
  (the router continues trying later entries). May be async.
- **`resolver(location, params)`** → returns the final `params` object passed to
  the component. May be async. Return `undefined` to abort — use this to perform
  a redirect (see below).

While an async guard or resolver is pending, `state.loading` is `true`. If the
user navigates again before it settles, the stale result is discarded.

## Navigation and the `location` object

The router exports a reactive `location` (a `SvelteURL`). Import it anywhere to
read or change the current route:

```js
import { location } from '$lib/components/HashRouter.svelte';
```

Read reactively:

```svelte
<p>Current path: {location.pathname}</p>
```

Navigate imperatively:

```js
location.assign('/articles/42');   // pushes a new history entry (back button works)
location.replace('/articles/42');  // replaces current entry (no back-button step)
```

Both accept a path with or without a leading `/`.

### Redirects

Redirect from a resolver by calling `location.replace(...)` and returning
`undefined`:

```js
{
    path: '/settings',
    resolver: (location) => {
        location.replace('/settings/general');
        return undefined; // abort this match; the new path re-resolves
    }
}
```

## Active-link styling with `matchAndResolve`

`matchAndResolve` is a helper for highlighting the current nav item. Pass
`location` (so the call re-runs on navigation), the path or `RegExp` to test, and
the classes to apply on match / no-match:

```svelte
<script>
    import { location, matchAndResolve } from '$lib/components/HashRouter.svelte';
</script>

<a
    href="#/articles"
    class={matchAndResolve(location, /^\/articles/, 'font-bold', 'text-gray-500')}
>
    Articles
</a>
```

Plain links are just anchors to hashes: `<a href="#/articles/42">…</a>`.

## `onnavigate` callback

The router calls an optional `onnavigate` prop after each successful match:

```svelte
<HashRouter {routes} onnavigate={({ path, params }) => track(path)} />
```

The payload is `{ path, relativePath, params }`. At the top level `path` and
`relativePath` are identical; they differ inside a child router (below).

## Nested routing with `ChildHashRouter`

To render a sub-section that owns its own routes (for example, tabs within a
detail page), give the parent route a **wildcard suffix** (`/*`) and mount a
`ChildHashRouter` inside the parent component.

**1. Parent route uses `/*`:**

```js
const routes = new Map([
    ['/', Home],
    [{ path: '/projects/:id/*' }, ProjectLayout], // note the /*
    ['*', NotFound]
]);
```

**2. Inside `ProjectLayout`, mount a child router with relative paths:**

```svelte
<!-- ProjectLayout.svelte -->
<script>
    import ChildHashRouter from '$lib/components/ChildHashRouter.svelte';
    import Overview from './Overview.svelte';
    import Members from './Members.svelte';
    import MemberDetail from './MemberDetail.svelte';

    let { params } = $props(); // params.id from the parent route

    const childRoutes = new Map([
        ['/overview', Overview],
        ['/members', Members],
        ['/members/:memberId', MemberDetail]
    ]);
</script>

<nav><!-- tabs go here --></nav>
<ChildHashRouter routes={childRoutes} />
```

Now `#/projects/7/members/3` matches `ProjectLayout` (parent), which in turn
matches `MemberDetail` (child). The child receives merged params — the parent's
plus its own — so `params.id` **and** `params.memberId` are both available.

### How it works

The top-level `HashRouter` publishes a reactive context (`ROUTER_CTX`)
containing the matched **`basePath`** (e.g. `/projects/7`) and the parent
`params`. `ChildHashRouter` reads that context, strips the `basePath` off the
current pathname, and matches its routes against the remainder. Child routers can
themselves nest — each one shadows the context with its own `basePath` for any
routers below it.

`ChildHashRouter` **must** be mounted somewhere beneath a `HashRouter`; it throws
if no parent router context is found.

### Building links inside a child

Because a child matches relative paths, build absolute hrefs from the context
`basePath`:

```svelte
<script>
    import { getContext } from 'svelte';
    import { ROUTER_CTX } from '$lib/components/HashRouter.svelte';

    const router = getContext(ROUTER_CTX);
</script>

<a href={`#${router.basePath}/members/3`}>Member 3</a>
```

## Constraints & gotchas

- **One top-level `HashRouter` per app.** Mounting a second one throws.
- **Catch-all last.** `*` matches everything; anything after it is unreachable.
- **First match wins.** Order specific routes before wildcards.
- **Routes are read once.** The route `Map` is turned into matchers at mount;
  changing it later has no effect. Keep the table static.
- **The hash is normalized on mount.** If the URL has no `#/...` hash, the router
  sets it to `#/`.
- **`ChildHashRouter` requires a wildcard parent.** Without `/*` on the parent
  route, the parent won't match sub-paths and the child never sees them.

## Exports reference

From `HashRouter.svelte`:

| Export            | Kind      | Purpose                                             |
| ----------------- | --------- | --------------------------------------------------- |
| `default`         | component | The top-level router.                               |
| `location`        | `$state`  | Reactive current URL; `.assign()`, `.replace()`.    |
| `matchAndResolve` | function  | Active-link class helper.                            |
| `RouteMatcher`    | class     | Path→matcher (used internally by `ChildHashRouter`).|
| `ROUTER_CTX`      | object    | Context key for reading `{ basePath, params }`.     |
| `state`           | `$state`  | `{ loading, component, params }` of the top router.  |

From `ChildHashRouter.svelte`:

| Export    | Kind      | Purpose                              |
| --------- | --------- | ------------------------------------ |
| `default` | component | Nested router (props: `routes`, `onnavigate`). |
