---
layout: ../../layouts/Doc.astro
title: "Tailscale & phone access"
description: "Discover your machines, configure SSH, and reach your agents over a private tailnet."
source: "docs/tailscale.md"
---

mxwl discovers machines through the Tailscale connection on your computer. Bring a remote checkout into the editor, run its terminals and agents there, and keep the embedded browser on your desktop.

Discovery reads `tailscale status --json` locally. You do not need a Tailscale API token or a separate mxwl account.

## Before you start

Install [Tailscale](https://tailscale.com/download) on the computer running mxwl and on the remote machine. Sign in, connect both devices, and confirm the remote machine appears when you run:

```sh
tailscale status
```

Your tailnet policy must permit the connection. Discovery shows peers visible to this computer, rather than an administrative inventory of every device in your organization.

## Choose your SSH authentication

There are two ways to connect over a tailnet:

| Connection | Remote machine | Authentication in mxwl |
| --- | --- | --- |
| Tailscale SSH | Tailscale SSH enabled and permitted by policy | Tailscale identity; no SSH key or password stored in mxwl |
| Ordinary SSH over Tailscale | A normal SSH server reachable at its mesh address | Your existing SSH agent, private key, or password |

To enable Tailscale SSH, run this **on the remote machine** with the privileges required by its Tailscale installation:

```sh
tailscale set --ssh
```

The tailnet needs network access rules and SSH rules allowing your identity to log in as the chosen remote operating-system user. Tailscale SSH servers are supported on Linux and on macOS with the open-source `tailscale` / `tailscaled` CLI distribution. Other installations can use ordinary SSH over the mesh. See [Tailscale's SSH documentation](https://tailscale.com/docs/features/tailscale-ssh) for platform support and policy configuration. Enabling Tailscale SSH changes who handles connections to port 22 at that machine's Tailscale address; reconnect any existing session using that address.

If your SSH policy uses **check mode**, first connect from a terminal and complete the browser approval. Replace the example username and address with your remote user and machine:

```sh
tailscale ssh developer@100.64.0.20
```

Then connect in mxwl. Check-mode approval can expire according to your policy.

## Discover and add a machine

1. Open **Projects**, select your project, and choose **Add host**.
2. Choose **Connect a new machine**, then select **Tailscale**.
3. Choose a device. Search by its name, DNS name, mesh address, or tag.
4. Confirm the **Username**. The suggestion comes from your local computer; it may differ from the username on the remote machine.
5. Continue to **Test & save** and test the connection. If the device is offline, choose **Save without connecting for now**. Saving takes you directly to the project host's folder setup.
6. Set the remote checkout and workspaces paths, review, and save the project host. Use **Open checkout** or **Other workspaces** from the overview to start working.

You can also open **Manage connections → Discover Tailscale** to create a reusable machine connection before assigning it to a project.

The picker shows machines advertising Tailscale SSH by default. **Show all devices** also reveals peers whose SSH access is unknown. For those machines, configure ordinary SSH credentials and make sure an SSH server is running. Discovery does not test your login permissions.

Online devices appear first. You can save an offline machine and connect when it returns. Existing connections are marked **Already configured**. mxwl uses the discovered mesh address, so MagicDNS is optional.

For checkout paths, worktree roots, services, browser profiles, and host overrides, read [Projects, hosts & workspaces](/docs/projects/).

## What runs where

Files, terminals, services, and coding agents run on the host that owns the workspace. The embedded browser runs inside mxwl on your desktop. The existing MCP/CDP bridge can give a remote agent access to that browser through loopback-bound SSH tunnels.

The remote machine still needs the agent executable and its provider credentials. Tailscale supplies connectivity and SSH identity; it does not replace your provider account or install your project dependencies.

## Check on agents from your phone

Keep mxwl running on your desktop and connect your phone to the tailnet.

1. Open **Settings → Control API & mobile dashboard**.
2. Enable the authenticated control server and **Allow devices on this network**, then save settings. Network access binds the control server to all interfaces.
3. Copy the generated **Bearer token**.
4. On your phone, open `http://DESKTOP_TAILSCALE_IP:9233/` using your desktop's mesh address and the configured control port.
5. Paste the token to connect. Your tailnet policy and desktop firewall must allow access to that port.

The dashboard shows live agent activity, accepts prompts, and lets you answer permission requests. Every API request still requires the control token, even from a device on the tailnet. Keep the token private: it grants control over your agents. A private tailnet connection needs no public port forwarding. Read [Fleet, CLI & mobile control](/docs/agent-control/) for the complete control interface.

## When something does not connect

| Symptom | Check |
| --- | --- |
| Tailscale was not found | Install Tailscale on the computer running mxwl, then refresh discovery. |
| Signed out or stopped | Connect Tailscale, approve this computer if required, and run `tailscale status` again. |
| No devices appear | Confirm the peer is visible to your local node and permitted by policy. Try **Show all devices** for ordinary SSH. |
| Device appears but login fails | Check the remote username, SSH mode, policy, and any check-mode browser approval. |
| Ordinary SSH cannot authenticate | Use your SSH agent, key, or password; appearing in discovery does not enable Tailscale SSH. |
| Phone cannot reach the dashboard | Keep mxwl open; enable network access; check the desktop mesh address, configured port, tailnet policy, and firewall. |
