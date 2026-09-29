# DRC Zulip container image

Builds a production Zulip container image **from this repository's local
checkout** — no `git clone` of an external URL. The image is what the
[Zulip Helm chart](https://github.com/zulip/docker-zulip) deploys (the chart
deploys a container image, **not** a release tarball), so this is the path for
testing and running DRC's `drc_9.2.x` changes on Kubernetes.

The build and promotion follow the **moodle-pls `cicd/build` standard**:

- `Makefile` — `build` (local) and `ci/build` (buildx `--push --sbom`, per-arch).
- `container_build` — Jenkinsfile: matrix builds `amd64`/`arm64` on native
  nodes into the **LE** ECR, then stitches a multi-arch manifest.
- `container_promote` — Jenkinsfile: `crane copy` an LE tag to the **prod** ECR.

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

### ECR repository and accounts

- Repository: `drc/pas/zulip`
- LE (dev): `333509430799.dkr.ecr.us-east-2.amazonaws.com`
- Prod: `911870898277.dkr.ecr.us-east-2.amazonaws.com`

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
make build                       # -> drc/pas/zulip:9.2-drc (loaded locally)
make build ZULIP_VERSION=9.2-drc # explicit version label
make run/interactive             # shell into the built image
```

## CI: build (`container_build`)

Wire `docker/container_build` as a multibranch/pipeline job. Per architecture,
on a native node, it runs:

```sh
make ci/build ECR=<le-ecr> ZULIP_VERSION=9.2-drc ARCH=amd64 SHORT_SHA=<sha>
```

which pushes `drc/pas/zulip:9.2-drc-amd64-<sha>` (and the arm64 equivalent)
to the LE ECR with an SBOM. The **Push Manifest** stage then creates the
multi-arch manifests via `docker buildx imagetools create`, under the tags:

- `<git-sha>`
- `<short-sha>`
- `9.2-drc-<short-sha>`
- `latest`

Each arch runs on a native node (`armProcessor` for arm64) because Zulip's
`provision` compiles native dependencies — cross-emulation is not viable.

## CI: promote (`container_promote`)

Wire `docker/container_promote` as a pipeline job. It runs on the
`container-runtime` agent (ships `crane`) and:

1. Presents an `IMAGE_TAG` dropdown sourced from the shared
   `ecr-all-repositories` config file (kept current by the ecr-notification
   sync jobs). If a needed tag is missing, run `Jenkinsfile-sync` first.
2. `crane copy`s that exact multi-arch manifest from the LE ECR to the prod
   ECR — no rebuild, so prod runs the byte-identical image that was tested in
   LE.

## Use with the Helm chart

Point the chart's Zulip image at `drc/pas/zulip` in the target account/region.
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
| `container_build` | Jenkinsfile: amd64/arm64 matrix -> LE ECR + multi-arch manifest. |
| `container_promote` | Jenkinsfile: `crane copy` an LE tag -> prod ECR. |
| `entrypoint.sh` | Container entrypoint (vendored from docker-zulip `11.x`). |
| `certbot-deploy-hook` | Certbot renewal hook (vendored from docker-zulip `11.x`). |
| `../.dockerignore` | Trims the build context but **keeps `.git`**. |
