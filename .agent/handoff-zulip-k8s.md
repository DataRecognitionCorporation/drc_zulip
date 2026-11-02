# Handoff: Zulip dev on shared-dev EKS (Argo CD) — as of 2026-10-01 09:50 CT

Internal notes. Lives in `drc_zulip/.agent/` (gitignored). Never copy into a tracked file in the public `drc_zulip` repo.

## Goal
Run DRC Zulip dev (currently EC2 via Terraform in `drc_zulip_infrastructure/{frontend,backend}`) on the `shared-dev` EKS cluster (us-east-2, acct 333509430799) via Argo CD, using the upstream Zulip Helm chart + the DRC image built from `drc_zulip`.

## Repos / where things live
- `drc_zulip` (PUBLIC, branch `drc_9.2.x`): app source, `docker/` (Dockerfile, Makefile, vendored docker-zulip **11.x** `entrypoint.sh`). In sync with origin.
- `drc_zulip_infrastructure` (private, `main`): `jenkins/*` pipelines, `argocd/dev/{dev.yaml,iam/,secrets/,image-updater.yaml}`. Argo reads `main` directly → **merging to main deploys**.
- `argocd` (private, `main`): `le/us-east-2/shared-dev/applications/zulip/zulip-dev.yaml` + bootstrap (project/app-of-apps/repo secret). Local `origin/main` cache is stale (ssh fetch failed); live Application has 4 sources: values ref, `argocd/dev/iam/`, `argocd/dev/secrets/`, chart `oci://ghcr.io/zulip/helm-charts/zulip` @ `2.3.0`.

## Done (all merged unless noted)
1. **Jenkins moved out of public repo** → `drc_zulip_infrastructure/jenkins/{ci-image,build-release,build-package,container-build,container-promote}/Jenkinsfile` + README. Each app-build job: `skipDefaultCheckout()`, `git` clone `https://github.com/DataRecognitionCorporation/drc_zulip.git` @ `drc_9.2.x` into `src/`, builds there. container-build passes `IMAGE_NAME=drc/pas/zulip` to `make ci/build`. Public repo scrubbed (README/Makefile/CHANGELOG §14; account IDs, moodle-pls, drc/pas/zulip removed). Makefile `IMAGE_NAME ?= drc/zulip` (overridable).
2. **Dockerfile fix** (drc_zulip): guard dev-secrets `[secrets]` append (`grep -q`) → fixed `DuplicateSectionError`. Image builds/pushes to `333509430799.dkr.ecr.us-east-2.amazonaws.com/drc/pas/zulip`.
3. **argocd** #168 onboard Zulip (project, app-of-apps, repo secret, zulip-dev + image-updater apps); #169 chart OCI path `oci://ghcr.io/zulip/helm-charts/zulip`; #170 add `argocd/dev/secrets/` source.
4. **drc_zulip_infrastructure** PRs:
   - #7 ExternalSecret `zulip-secrets` (keys `postgres_password`, `secret_key`, `rabbitmq-password`, `redis-password`, `memcached-password`) from Secrets Manager **`zulip/dev`** via platform SecretStore **`zulip`** (ns zulip, SA `zulip-irsa`, managed by EKS-Applications `app/external-secrets-stores`; do NOT define our own store). dev.yaml wired to it; added `DB_HOST/DB_HOST_PORT/DB_NAME/DB_USER/REMOTE_POSTGRES_SSLMODE` (11.x entrypoint ignores chart's `SETTING_REMOTE_POSTGRES_*`).
   - #8 `SETTING_RUNNING_IN_HELM: "True"` (chart's bool → `true` → Python NameError); ingress `target-type: ip`, `healthcheck-path: /health`.
   - #9 ingress `listen-ports: [{"HTTPS":443}]` (group `generic.external` ssl-redirects all :80). Cert auto-discovered (`*.datarecognitioncorp.com` now on the 443 listener) — user: don't set certificate-arn.
   - #10 removed `conditions.zulip-dev` annotation (duplicate host → `Condition values must be unique`, was blocking the whole shared ALB group).
   - #11 `DISABLE_HTTPS: "True"` (image redirected all HTTP → 301); `SETTING_LOADBALANCER_IPS` → `LOADBALANCER_IPS: "10.240.0.0/16"` (11.x writes zulip.conf `[loadbalancer] ips` only from unprefixed name).
   - #12 `POD_IP` (fieldRef status.podIP) + `SETTING_ALLOWED_HOSTS: "['$(POD_IP)']"` (ALB health check sends Host=pod IP → Django 400; mirrors EC2 bootstrap adding local IP); ingress path `/*` (chart hardcodes `pathType: ImplementationSpecific`, `/` matched root only).

## Current state (09:48 CT, not yet settled after #12)
- Pods: rabbitmq/redis/memcached Running. `zulip-dev-0` 1/1 Running (1 restart), **readiness gate 0/1**, still the pod from #11 (created 14:27Z); StatefulSet already has #12's `SETTING_ALLOWED_HOSTS` → pod not yet rolled (last rollout took ~7 min).
- ALB target `10.240.35.24` **unhealthy `Target.ResponseCodeMismatch`**.
- Via ALB (`--resolve chat-dev.datarecognitioncorp.com:443:<alb-ip>`): `/health` → **403**, `/login/` → **500**. Not investigated (WAF on the ALB? Zulip? old pod lacks ALLOWED_HOSTS). Check again after the pod rolls.
- DNS `chat-dev.datarecognitioncorp.com` still → EC2. No user traffic on K8s. EC2 stack untouched (ASG `zulip-dev`, Aurora `zulip-dev-0`, NLB+ALB `zulip-dev*`).

## Open issues / not done
- **Verify #12** after rollout: target healthy, pod Ready, ALB responses. Then debug 403/500 if they persist (pod logs, ALB WAF `cloud-regional-basic`, Zulip `/var/log/zulip/errors.log`).
- **Chart mismatch (user unhappy with chart)**: chart 2.3.0 targets docker-zulip 12.x; image uses 11.x entrypoint. Proposed next step: pull chart **1.11.61** (also 1.11.57/60 on GHCR) and diff — likely matches 11.x entrypoint. Fallback: own chart in `helm-charts/charts/zulip` (like moodle). Awaiting user choice.
- **Live DB shared**: K8s points at the live dev Aurora (`zulip-dev-db.cloud-shared-le.drcedirect.com`) used by EC2 → split RabbitMQ/memcached/Tornado state; `image.tag: latest` can run migrations. Suggested: snapshot copy for testing, pin SHA tag. Not done.
- RabbitMQ erlang cookie regenerated every render (no stable cookie) → diffs/restarts. Not done.
- `email_password` not wired (SECRETS_email_password) → no outgoing email. Not done.
- Resources: limit 2 CPU / 4Gi vs EC2 t4g.large 8 GB. Chart has no replicas knob; Zulip can't scale horizontally (Tornado in-memory queues) — scale up only. uwsgi/tornado tuning needs entrypoint change (11.x ignores `CONFIG_*`).
- Cutover plan (not started): stop EC2 app → K8s DB at real Aurora → Route53 UPSERT `chat-dev` to ALB `eks-generic-external-256439362.us-east-2.elb.amazonaws.com` (alias zone `Z3AADJGX6KTTL2`). Zone account for datarecognitioncorp.com not checked.
- `.git/logs` in drc_zulip still has old commit subjects mentioning drc_assumeRole (history; not rewritten).

## Useful facts
- Shared ALB: `eks-generic-external`, group `generic.external`, HTTPS:443 rules: 1 moodle-dev, 2 moodle-devops, 3 chat-dev. Target group `k8s-zulip-zulipdev-d4b5cd2e10` (ip).
- external-dns domain filters: `cloud-shared-le.drcedirect.com`, `awcl.drcedirect-le.com` → won't touch chat-dev DNS.
- Image updater pins `image.tag` to `latest@sha256:...` via Application helm parameters.
- Local helm can't pull from GHCR (stale creds → 403); fetch chart anonymously: token from `https://ghcr.io/token?scope=repository:zulip/helm-charts/zulip:pull&service=ghcr.io`, manifest → `chart.content` layer blob → tar. Render check: `helm template ./zulip --name-template zulip-dev --namespace zulip --kube-version 1.36.3 --values argocd/dev/dev.yaml`.
- 11.x entrypoint `setConfigurationValue`: values `true/false/None` → bool (verbatim), digits → int, `[...]`/`(...)` → array (verbatim), else quoted string.
- Pod probes use `curl --fail` → a 301 counts as healthy (misleading).

## Working agreements with the user
- Ask before each commit/push/PR/merge (permission doesn't carry over). User usually says "pr and merge it" → squash-merge via `gh pr merge --squash`. `gh pr edit` breaks (projects-classic GraphQL); use `gh api -X PATCH .../pulls/N -F body=@file`.
- Infra changes go on branches off `origin/main` (never push main directly — it deploys).
- Pass `context: shared-dev/us-east-2` and `--profile shared-services-le --region us-east-2` explicitly. Read-only on cluster/AWS unless asked. Never print secret values (compare by key/equality only).
- User sometimes commits WIP as "update" on the branch before saying yes — check `git log`/`status` first and reuse their commit.
