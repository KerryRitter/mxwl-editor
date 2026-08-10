# Tab groups (cookie sandboxes)

Each browser tab belongs to a group, and **a group is a cookie jar**. Tabs in
group A and group B can be signed into the same site as different users at the
same time — no shared cookies, localStorage, or sessionStorage.

The sandbox row sits above the tab strip:

```
🍪  [ Default · 2 ]  [ Group 2 · 1 ]  + Sandbox
```

| Action | How |
|---|---|
| New sandbox | `+ Sandbox` |
| Rename | Double-click the group name |
| New tab in a group | `+` on that group's chip |
| Sign everything out | Cookie icon on the chip — clears that group's storage only |
| Close group + its tabs | `×` on the chip (not available for Default) |
| Move a tab between groups | Hover the tab, use the hidden select |

## Colours

Each group gets the next colour from a fixed palette. It shows as the tab's top
border, the tab's status dot, and a 2px border around the browser viewport, so
the active tab's sandbox is visible at a glance.

## Sessions

`Default` deliberately stays on Electron's default session, so logins that
predate tab groups keep working. Every later group gets
`persist:mxwl-<wsId>-<groupId>`.

Group ids are sequential (`g1`, `g2`, …) rather than random, and the workspace id
is persisted, so a group's partition name is stable — cookies survive a relaunch.
Group *labels and colours* are not persisted yet: after a restart the sandbox row
resets to `Default`, and the next `+ Sandbox` reuses `g2`'s existing cookie jar.

## Moving tabs

A view's partition is fixed when Chromium creates it, so moving a tab rebuilds it
in the target sandbox. The URL carries over; page state (scroll, form input,
history) does not.
