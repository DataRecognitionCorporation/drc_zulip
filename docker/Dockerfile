# syntax=docker/dockerfile:1
ARG ZULIP_BUILDER_IMAGE=drc/zulip-base:9.2-drc-builder
ARG ZULIP_RUNTIME_IMAGE=drc/zulip-base:9.2-drc-runtime

# Versioned base references are provided by the Makefile or CI.
# hadolint ignore=DL3006
FROM ${ZULIP_BUILDER_IMAGE} AS build
USER root
# Keep dependencies, but discard baseline source so deleted files stay deleted.
RUN mv /home/zulip/zulip/node_modules /home/zulip/base-node_modules && \
    rm -rf /home/zulip/zulip && \
    mkdir /home/zulip/zulip && chown zulip:zulip /home/zulip/zulip
USER 1000
WORKDIR /home/zulip/zulip
COPY --chown=zulip:zulip . .

# Dependency changes require rebuilding the bases, not reusing stale venvs.
RUN sha256sum --check /home/zulip/base-inputs.sha256 && \
    mv /home/zulip/base-node_modules node_modules && \
    ln -s /srv/zulip-py3-venv zulip-py3-venv && \
    printf '\nDEBUG = False\n' >> zproject/prod_settings_template.py && \
    printf '[secrets]\nlocal_database_password = not_used_here\nsecret_key = not_used_here\nshared_secret = not_used_here\navatar_salt = not_used_here\nrabbitmq_password = not_used_here\ninitial_password_salt = not_used_here\n' > zproject/dev-secrets.conf && \
    . /srv/zulip-py3-venv/bin/activate && \
    OVERRIDE_MERGE_BASE=9.2 ./tools/cache-zulip-git-version && \
    ./tools/update-prod-static && \
    git rev-parse HEAD > build_id && printf '9.2\n' > version

# Export only runtime files, using Zulip's release exclusions.
RUN mkdir -p /home/zulip/runtime && \
    sed 's|/$||' tools/release-tarball-exclude.txt > /tmp/runtime-excludes && \
    tar --exclude-from=/tmp/runtime-excludes \
        --exclude=.git --exclude=node_modules --exclude=var \
        --exclude=docker --exclude=drc_notes --exclude=.agent \
        --exclude=zulip-py3-venv --exclude=zulip-current-venv \
        --exclude=zproject/dev-secrets.conf \
        --exclude='*/__pycache__' --exclude='*.pyc' \
        -cf /tmp/runtime.tar . && \
    tar -xf /tmp/runtime.tar -C /home/zulip/runtime && \
    rm -f /tmp/runtime.tar /tmp/runtime-excludes

# hadolint ignore=DL3006
FROM ${ZULIP_RUNTIME_IMAGE} AS runtime
# The entrypoint configures services as root, then runs Zulip as its own user.
# hadolint ignore=DL3002
USER root
ARG ZULIP_VERSION=9.2-drc
LABEL org.opencontainers.image.title="Zulip Server"
LABEL org.opencontainers.image.version="$ZULIP_VERSION"
LABEL org.opencontainers.image.source="https://github.com/DataRecognitionCorporation/drc_zulip"
LABEL org.opencontainers.image.licenses="Apache-2.0"

COPY --from=build --chown=zulip:zulip /home/zulip/runtime/ /home/zulip/deployments/custom/
COPY --from=build /home/zulip/base-inputs.sha256 /tmp/builder-inputs.sha256
WORKDIR /home/zulip/deployments/custom
RUN cmp /tmp/builder-inputs.sha256 /home/zulip/base-inputs.sha256 && \
    rm -f /tmp/builder-inputs.sha256 && \
    ln -s "$(readlink -f /home/zulip/deployments/current/zulip-py3-venv)" zulip-py3-venv && \
    ln -s zulip-py3-venv zulip-current-venv && \
    ln -sfn /etc/zulip/settings.py zproject/prod_settings.py && \
    rm -rf /home/zulip/prod-static && \
    cp -a prod-static/serve /home/zulip/prod-static && \
    test -f zulip-py3-venv/bin/activate_this.py && \
    deploy_path="$(./scripts/lib/zulip_tools.py make_deploy_path)" && \
    test ! -e "$deploy_path" && \
    mv /home/zulip/deployments/custom "$deploy_path" && \
    ln -sfn "$deploy_path" /home/zulip/deployments/current && \
    ln -sfn "$deploy_path" /home/zulip/deployments/next

COPY --chmod=755 docker/entrypoint.sh /sbin/entrypoint.sh
COPY --chmod=755 docker/certbot-deploy-hook /sbin/certbot-deploy-hook
WORKDIR /home/zulip/deployments/current
EXPOSE 25 80 443
ENTRYPOINT ["/sbin/entrypoint.sh"]
CMD ["app:run"]
