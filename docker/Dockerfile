# syntax=docker/dockerfile:1
#
# Build a production Zulip container image directly from THIS repository's
# local checkout. The source is bundled straight into the image and installed
# in place -- no release tarball, no git clone, no Artifactory round-trip.
#
# scripts/lib/install derives ZULIP_PATH from its own location and installs
# whatever tree it lives in. When installing from a checkout (no prebuilt
# prod-static / zulip-git-version present) it builds the static assets and Git
# version itself via tools/update-prod-static + tools/cache-zulip-git-version.
# That from-checkout path needs a real .git with an upstream, so the build
# context includes .git (kept by .dockerignore) and the changes must be
# committed.
#
# Targets Zulip 9.2 (`drc_9.2.x`), aligned with the zulip/docker-zulip `11.x`
# packaging (same `zulip::profile::docker` puppet class, same runtime
# entrypoint contract). Do NOT swap in docker-zulip `main`'s (12.x) helpers;
# that entrypoint hard-fails on the env-var names this image expects.

# ---------------------------------------------------------------------------
# Stage 0: common base
# ---------------------------------------------------------------------------
FROM ubuntu:24.04 AS base

ENV LANG="C.UTF-8"
ARG UBUNTU_MIRROR

# hadolint ignore=DL3005,DL3008,DL3009
RUN { [ ! "$UBUNTU_MIRROR" ] || sed -i "s|http://\(\w*\.\)*archive\.ubuntu\.com/ubuntu/\? |$UBUNTU_MIRROR |" /etc/apt/sources.list; } && \
    apt-get -q update && \
    apt-get -q dist-upgrade -y && \
    DEBIAN_FRONTEND=noninteractive \
    apt-get -q install --no-install-recommends -y \
        ca-certificates git locales python3 sudo tzdata && \
    touch /var/mail/ubuntu && chown ubuntu /var/mail/ubuntu && userdel -r ubuntu && \
    useradd -d /home/zulip -m zulip -u 1000

# ---------------------------------------------------------------------------
# Stage 1: build the Zulip source (provision + static assets) in place
# ---------------------------------------------------------------------------
FROM base AS build

RUN echo 'zulip ALL=(ALL:ALL) NOPASSWD:ALL' >> /etc/sudoers
USER zulip
WORKDIR /home/zulip/zulip

# Bundle the repository (including .git) straight into the image. The build
# context is the repo root (see docker/Makefile / docker/README.md), so this
# is the committed source with no network clone. .dockerignore trims heavy,
# non-source paths (var/, .venv/, node_modules, ...) but keeps .git and the
# web/, tools/, static/ trees needed to build the static assets from source.
COPY --chown=zulip:zulip . .

# Provision the build environment and build the production static assets from
# the checkout, so the runtime install doesn't have to (and so the heavy build
# toolchain stays out of the final image).
#
# provision creates the venv at /srv/zulip-py3-venv. The DRC repo runs these
# tools inside that venv (see tools/ci/activate-venv + tools/build-release-tarball),
# NOT via `uv` -- uv is not on PATH in this environment. update-prod-static also
# needs DEBUG=False and a dev-secrets stub to run, exactly as build-release-tarball
# sets up before calling it.
RUN SKIP_VENV_SHELL_WARNING=1 ./tools/provision --build-release-tarball-only && \
    printf '\nDEBUG = False\n' >> zproject/prod_settings_template.py && \
    printf '\n[secrets]\nlocal_database_password = ""\nsecret_key = "not_used_here"\nshared_secret = "not_used_here"\navatar_salt = "not_used_here"\nrabbitmq_password = "not_used_here"\ninitial_password_salt = "not_used_here"\n' >> zproject/dev-secrets.conf && \
    . /srv/zulip-py3-venv/bin/activate && \
    ./tools/update-prod-static && \
    ./tools/cache-zulip-git-version && \
    rm -rf node_modules

# ---------------------------------------------------------------------------
# Stage 2: production runtime image
# ---------------------------------------------------------------------------
FROM base

ENV DATA_DIR="/data"

ARG ZULIP_VERSION=9.2-drc
LABEL org.opencontainers.image.title="DRC Zulip Server"
LABEL org.opencontainers.image.version="$ZULIP_VERSION"
LABEL org.opencontainers.image.source="https://github.com/DataRecognitionCorporation/drc_zulip"
LABEL org.opencontainers.image.licenses="Apache-2.0"

# Bring the built source tree (with prod-static + zulip-git-version already
# generated) in from the build stage and install it in place with the Docker
# puppet profile. Because the static assets and git-version file are present,
# the installer skips its from-source asset build. Secrets/settings are
# stripped so the entrypoint (re)generates them per-container at runtime.
COPY --from=build /home/zulip/zulip /root/zulip
WORKDIR /root

RUN \
    dpkg-divert --add --rename /etc/init.d/nginx && \
    ln -s /bin/true /etc/init.d/nginx && \
    mkdir -p "$DATA_DIR" && \
    /root/zulip/scripts/setup/install --hostname="$(hostname)" --email="docker-zulip" \
        --puppet-classes="zulip::profile::docker" --postgresql-version=14 && \
    rm -f /etc/zulip/zulip-secrets.conf /etc/zulip/settings.py && \
    apt-get -qq autoremove --purge -y && \
    apt-get -qq clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# These helper files live under docker/ in the repo, and the build context is
# the repo root, so reference them with the docker/ prefix.
COPY docker/entrypoint.sh /sbin/entrypoint.sh
COPY docker/certbot-deploy-hook /sbin/certbot-deploy-hook

VOLUME ["$DATA_DIR"]
EXPOSE 25 80 443
ENTRYPOINT ["/sbin/entrypoint.sh"]
CMD ["app:run"]
