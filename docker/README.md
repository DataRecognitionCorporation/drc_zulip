# DRC Zulip container image

Builds a production Zulip container image **from this repository's local
checkout** — no `git clone` of an external URL. The image is what the
[Zulip Helm chart](https://github.com/zulip/docker-zulip) deploys (the chart
deploys a container image, **not** a release tarball), so this is the path for
testing and running DRC's `drc_9.2.x` changes on Kubernetes.

The `Makefile` provides `build` (local single-arch) and `ci/build` (buildx
`--push --sbom`, per-arch) targets. CI/CD pipelines that drive the per-arch
build, multi-arch manifest, and promotion are maintained separately, outside
this repository.

## How the image is built

`Dockerfile` is a two-stage build that bundles this repository's source
straight into the image and installs it in place — **no release tarball, no
git clone, no Artifactory round-trip**.

1. **Build stage** — copies the repo (including `.git`) in, provisions the
   build env, builds the production static assets from source
   (`tools/update-prod-static`), and stamps the git version
   (`tools/cache-zulip-git-version`).
2. **Runtime stage** — copies the built tree in and runs
   `scripts/setup/install` with the `zulip::profile::docker` Puppet class.
   Because the static assets and git-version file are already present, the
   installer skips its from-source asset build. Adds the container
   `entrypoint.sh` and `certbot-deploy-hook`.

### Version alignment

Targets **Zulip 9.2** (`drc_9.2.x`), aligned with the `zulip/docker-zulip`
**`11.x`** packaging (same Puppet profile, same `build-release-tarball docker`
invocation, same runtime env-var contract). `entrypoint.sh` and
`certbot-deploy-hook` are vendored from that `11.x` branch. **Do not** replace
them with docker-zulip `main` (12.x) — the 12.x entrypoint renames/removes the
`DB_*` and HTTPS env vars this image accepts and hard-fails on them.

## Prerequisites

- Docker with BuildKit / `buildx`.
- **Commit your changes first.** `build-release-tarball` runs
  `git archive HEAD` and refuses a dirty work tree, so only committed content
  reaches the image. `.dockerignore` (at the repo root) deliberately keeps
  `.git`.
- ~4 GB RAM available to the builder.

## Local build

From the `docker/` directory (the Makefile points buildx at the repo root):

```sh
make build                       # -> drc/zulip:9.2-drc (loaded locally)
make build ZULIP_VERSION=9.2-drc # explicit version label
make run/interactive             # shell into the built image
```

## CI/CD

The per-architecture build, multi-arch manifest assembly, and LE→prod
promotion are driven by pipelines maintained outside this repository. They
invoke the same `make ci/build` target documented above against a checkout of
this branch; the image tag scheme they publish is:

- `<git-sha>`
- `<short-sha>`
- `9.2-drc-<short-sha>`
- `latest`

Each architecture builds on a native node because Zulip's `provision` compiles
native dependencies — cross-emulation is not viable.

## Use with the Helm chart

Point the chart's Zulip image at wherever you pushed this image.
In your `values-local.yaml` (from the chart's `values-local.yaml.example`),
override the image repository and tag, then:

```sh
helm dependency update      # pull PostgreSQL/RabbitMQ/Memcached/Redis subcharts
helm install -f values-local.yaml zulip .
```

By default the chart runs PostgreSQL, RabbitMQ, Memcached, and Redis as Bitnami
subcharts; any can be disabled to use external services. See the
[Helm getting-started guide](https://zulip.readthedocs.io/projects/docker/en/latest/how-to/helm-getting-started.html).

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Two-stage build from the local checkout. |
| `Makefile` | `build` (local) and `ci/build` (buildx `--push --sbom`, per-arch). |
| `entrypoint.sh` | Container entrypoint (vendored from docker-zulip `11.x`). |
| `certbot-deploy-hook` | Certbot renewal hook (vendored from docker-zulip `11.x`). |
| `../.dockerignore` | Trims the build context but **keeps `.git`**. |
