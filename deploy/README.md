# Running heath.js on the VM

How the deployed heath.js is set up and maintained. Server details (host names, accounts, keys) are deliberately not in this repository; ask the maintainer. Background and history: [#40](https://github.com/sawenchalmers/heath.js/issues/40).

## How it fits together

```
browser ─▶ front page ─┬─ /heath/…      ─▶ heath-frontend ─▶ heath.js image: serves the app, and forwards
                       │                                     /heath/proxy/… to EPSM, the climate site (later the engine)
                       └─ /heath/api/…  ─▶ heath-backend  ─▶ reserved for Heath's own server side (placeholder for now)

GitHub ─ every merge to main ─▶ ghcr.io/sawenchalmers/heath.js:<version> and :latest
VM     ─ podman auto-update  ─▶ pulls a new :latest and restarts heath-frontend
```

- **The front page** handles HTTPS, login and access, and forwards requests to the two services below. It is maintained separately and not described here. Who may use Heath is managed on the front page.
- **Two Podman Quadlet services** are set up for Heath: `heath-frontend` and `heath-backend`. Their unit files (`.container`) are in `/etc/containers/systemd/`. They are hardened: each runs in its own user namespace with all capabilities dropped and no new privileges, and only listens on the VM itself.
- **`heath-frontend` runs the heath.js image.** It serves the app and forwards everything under `/proxy/` to outside services: EPSM and the climate site now, the engine later (#59), with the engine's API key as a Podman secret (#45).
- **`heath-backend` is reserved for Heath's own server-side parts,** such as the database for saving projects (#56). Until those exist it runs a placeholder; nothing in the app calls `/heath/api/…`.
- **GitHub never connects to the VM.** The VM pulls the public image itself.

### What the image must do (and does)

- Run as a non-root user and listen on **port 8080** (it uses `nginx-unprivileged`).
- Serve the app under `/heath/`, whether or not the front server strips the `/heath` prefix.
- Hold **no secrets**: the image is public. The engine's API key will be given to `heath-frontend` on the VM as a Podman secret (#45), never built into the image.
- Be able to write `/etc/nginx/conf.d` when it starts: the site configuration is filled in from a template and written there at start-up. If the units are ever made read-only (`ReadOnly=true`), give that folder a writable mount (e.g. `Tmpfs=/etc/nginx/conf.d`). Otherwise nginx quietly serves its default welcome page instead of Heath, while the container looks healthy.

## Pointing heath-frontend at heath.js

Done once (it starts out with an nginx placeholder). As an administrator on the VM:

1. In `/etc/containers/systemd/heath-frontend.container`, set:
   ```ini
   Image=ghcr.io/sawenchalmers/heath.js:latest
   ```
2. Let systemd regenerate the services and restart them:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart heath-frontend.service
   ```
   The first start pulls the image, which can take a minute.
3. Check it runs, and which version:
   ```bash
   sudo systemctl status heath-frontend.service --no-pager
   sudo podman inspect heath-frontend --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
   ```
4. Open Heath through the front page and check the version badge.

### heath-backend's placeholder

`heath-backend` should run its placeholder image until Heath has server-side parts. If it still points at heath.js (as in the first set-up, before the forwarding moved to `heath-frontend`), switch it back, **after** a heath.js version that uses `/proxy/` (0.2.5 or later) is live:

1. In `/etc/containers/systemd/heath-backend.container`, set:
   ```ini
   Image=docker.io/nginxinc/nginx-unprivileged:stable-alpine
   ```
2. `sudo systemctl daemon-reload && sudo systemctl restart heath-backend.service`
3. Check: `sudo podman ps --format "{{.Names}}  {{.Image}}"` shows the placeholder for `heath-backend`, and Heath's weather and construction choices still work through the front page.

## Updates

- `podman auto-update` checks the registry for a newer image for every container labelled for it (`heath-frontend` is), pulls it and restarts the container. If the new container **fails to start**, it rolls back to the previous image by itself. A release that starts but misbehaves (e.g. a blank page) is not rolled back, so check Heath after an update, and roll back by hand if needed (below).
- It is run by the system timer `podman-auto-update.timer`. Podman's default is once a day, but the VM overrides the schedule with a drop-in file in `/etc/systemd/system/podman-auto-update.timer.d/` (at the time of writing: every 5 minutes). The timer covers every such container on the VM, so a change to its schedule affects all of them. Change the schedule in that existing drop-in rather than adding another: drop-ins are read in alphabetical order, so a new one could silently override it.
  ```bash
  systemctl cat podman-auto-update.timer --no-pager      # the schedule, including drop-ins
  systemctl list-timers podman-auto-update.timer --no-pager   # when it runs next
  systemctl status podman-auto-update.timer --no-pager   # enabled?
  sudo podman auto-update --dry-run                      # what would be updated now
  sudo podman auto-update                                # update now, without waiting
  ```
- A new version appears after a merge to `main` once GitHub has published it (a few minutes) and the timer has next run.

## Rolling back

Every published version stays in the registry under its number; a version whose release was skipped (when several merges land while a release is running) has no image. List them with `sudo podman search --list-tags ghcr.io/sawenchalmers/heath.js`, or on the package's page on GitHub.

To run an older version:

1. In `heath-frontend.container`, pin the version, e.g. `Image=ghcr.io/sawenchalmers/heath.js:0.2.2`.
2. `sudo systemctl daemon-reload && sudo systemctl restart heath-frontend.service`.
3. When the problem is fixed and released, set `Image=` back to `:latest`, then fetch the new image before restarting. Podman reuses an image it already has, so without this step it would start the old, broken `:latest` again:
   ```bash
   sudo podman pull ghcr.io/sawenchalmers/heath.js:latest
   sudo systemctl daemon-reload && sudo systemctl restart heath-frontend.service
   ```

While pinned, auto-update leaves that version alone (it only follows the tag in `Image=`).

## Logs

```bash
sudo journalctl -u heath-frontend.service -n 50 --no-pager   # service and nginx messages
sudo podman logs --tail 50 heath-frontend                    # the container's own output
```

## Testing an image before it goes out

The manual test checklists in #40 cover running the image locally, behind a stand-in for the front server under `/heath/`, and under the same restrictions as the services.
