# syntax=docker/dockerfile:1

# This upstream 9.2-0 image is amd64-only. Reuse its installed Python
# environment and services; only rebuild the customized application assets.
ARG ZULIP_BASE_IMAGE=zulip/docker-zulip:9.2-0@sha256:319c9f1c5f0fd73f1e65ac4e86fca2853bc933105c58d0af98224d9c7a2709dc
# The build argument above pins both the version and digest.
# hadolint ignore=DL3006
FROM ${ZULIP_BASE_IMAGE} AS base

FROM base AS build
USER root
ENV COREPACK_DEFAULT_TO_LATEST=0

# gettext is needed by compilemessages, but not by the runtime image.
# hadolint ignore=DL3008
RUN apt-get -q update && \
    apt-get -q install --no-install-recommends -y gettext && \
    rm -rf /var/lib/apt/lists/* && \
    rm -f /etc/zulip/zulip.conf && \
    mkdir -p /opt/zulip /opt/zulip-runtime && \
    chown zulip:zulip /opt/zulip /opt/zulip-runtime

USER 1000
WORKDIR /opt/zulip

# Keep dependency installation cached when application source changes.
COPY --chown=zulip:zulip package.json pnpm-lock.yaml .npmrc ./
COPY --chown=zulip:zulip patches/ patches/
RUN /usr/local/bin/corepack pnpm install --frozen-lockfile --prod

COPY --chown=zulip:zulip . .

# Refuse to silently reuse an incompatible production Python environment.
RUN cmp requirements/prod.txt /home/zulip/deployments/current/requirements/prod.txt && \
    cmp requirements/common.in /home/zulip/deployments/current/requirements/common.in && \
    cmp requirements/prod.in /home/zulip/deployments/current/requirements/prod.in && \
    ln -s /home/zulip/deployments/current/zulip-py3-venv zulip-py3-venv && \
    printf '\nDEBUG = False\n' >> zproject/prod_settings_template.py && \
    printf '[secrets]\nlocal_database_password = not_used_here\nsecret_key = not_used_here\nshared_secret = not_used_here\navatar_salt = not_used_here\nrabbitmq_password = not_used_here\ninitial_password_salt = not_used_here\n' > zproject/dev-secrets.conf && \
    mkdir -p var/log && \
    . ./zulip-py3-venv/bin/activate && \
    OVERRIDE_MERGE_BASE=9.2 ./tools/cache-zulip-git-version && \
    ./tools/update-prod-static && \
    git rev-parse HEAD > build_id && \
    printf '9.2\n' > version

# Export runtime files without shipping Git history or build dependencies.
RUN sed 's|/$||' tools/release-tarball-exclude.txt > /tmp/runtime-excludes && \
    tar --exclude-from=/tmp/runtime-excludes \
        --exclude=.git --exclude=node_modules --exclude=var \
        --exclude=docker --exclude=drc_notes --exclude=.agent \
        --exclude=zproject/dev-secrets.conf \
        --exclude='*/__pycache__' --exclude='*.pyc' \
        -cf /tmp/zulip-runtime.tar . && \
    tar -xf /tmp/zulip-runtime.tar -C /opt/zulip-runtime && \
    rm -f /tmp/zulip-runtime.tar /tmp/runtime-excludes

FROM base AS runtime
# The upstream entrypoint needs root to configure and start services.
# hadolint ignore=DL3002
USER root

ARG ZULIP_VERSION=9.2-drc
LABEL org.opencontainers.image.title="Zulip Server"
LABEL org.opencontainers.image.version="$ZULIP_VERSION"
LABEL org.opencontainers.image.source="https://github.com/DataRecognitionCorporation/drc_zulip"
LABEL org.opencontainers.image.licenses="Apache-2.0"

# These services are started by the vendored 11.x entrypoint, but are not
# installed in the upstream image. Keep this layer independent of source.
# hadolint ignore=DL3008
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d && chmod +x /usr/sbin/policy-rc.d && \
    apt-get -q update && \
    DEBIAN_FRONTEND=noninteractive \
    apt-get -q install --no-install-recommends -y \
        erlang-base rabbitmq-server redis-server memcached && \
    mkdir -p /etc/rabbitmq && \
    cp /home/zulip/deployments/current/puppet/zulip/files/rabbitmq/rabbitmq.config \
        /home/zulip/deployments/current/puppet/zulip/files/rabbitmq/rabbitmq-env.conf /etc/rabbitmq/ && \
    chown -R rabbitmq:rabbitmq /etc/rabbitmq && \
    rm -f /usr/sbin/policy-rc.d && \
    apt-get -qq clean && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=zulip:zulip /opt/zulip-runtime/ /home/zulip/deployments/custom/

RUN ln -sfn /home/zulip/deployments/custom /home/zulip/deployments/current && \
    ln -sfn /home/zulip/deployments/custom /home/zulip/deployments/next && \
    ln -sfn /etc/zulip/settings.py /home/zulip/deployments/custom/zproject/prod_settings.py && \
    rm -rf /home/zulip/prod-static && \
    cp -a /home/zulip/deployments/custom/prod-static/serve /home/zulip/prod-static

COPY --chmod=755 docker/entrypoint.sh /sbin/entrypoint.sh
COPY --chmod=755 docker/certbot-deploy-hook /sbin/certbot-deploy-hook

WORKDIR /home/zulip/deployments/current
EXPOSE 25 80 443
ENTRYPOINT ["/sbin/entrypoint.sh"]
CMD ["app:run"]
