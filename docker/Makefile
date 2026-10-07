# Build targets for the DRC Zulip container image.
#
# CI workflow: publish both bases with `ci/base-build`, then run `ci/build`.
# All build targets build one ARCH at a time (default: amd64). Jenkins runs
# amd64 and arm64 on native agents and publishes multi-architecture manifests.
#
# Reuse our provisioned bases and rebuild assets from the repository-root
# context. .git is needed to stamp the customized application version.

# Variables
# IMAGE_NAME is the repository path (without registry host). CI overrides it to
# the real ECR repository path via `make ci/build IMAGE_NAME=...`.
IMAGE_NAME ?= drc/zulip
DOCKERFILE := Dockerfile
DOCKER_BUILD_CONTEXT := ..

# Version label baked into the image (ARG ZULIP_VERSION). Matches version.py.
ZULIP_VERSION ?= 9.2-drc
BASE_IMAGE_NAME ?= drc/zulip-base
# Both base images must come from the same base release. Rebuild them when
# dependency or installer inputs change; code builds check their fingerprints.
BASE_VERSION ?= 9.2-drc
ZULIP_BUILDER_IMAGE ?= $(BASE_IMAGE_NAME):$(BASE_VERSION)-builder
ZULIP_RUNTIME_IMAGE ?= $(BASE_IMAGE_NAME):$(BASE_VERSION)-runtime
BASE_TARGET ?= builder
# Optional registry cache imported and exported by CI targets.
CACHE_REF ?=
comma := ,

ECR ?= null
ARCH ?= amd64
SHORT_SHA ?= 0

.PHONY: ci/build ci/base-build lint run/interactive clean

# Run Hadolint and fail on warnings or higher.
lint:
	docker run --rm -i -v "$(CURDIR):/work" -w /work hadolint/hadolint:v2.12.0 \
		hadolint --config .hadolint.yaml --failure-threshold warning $(DOCKERFILE) Dockerfile.base

# CI CODE build: rebuild assets using existing builder/runtime bases, push to
# ECR, attach an SBOM, and import/export CACHE_REF when set.
# Publishes <version>-<arch>-<short_sha>; Jenkins combines architecture tags.
ci/build:
	DOCKER_BUILDKIT=1 docker buildx build \
		--file $(DOCKERFILE) \
		--progress=plain \
		--build-arg ZULIP_VERSION=$(ZULIP_VERSION) \
		--build-arg ZULIP_BUILDER_IMAGE=$(ZULIP_BUILDER_IMAGE) \
		--build-arg ZULIP_RUNTIME_IMAGE=$(ZULIP_RUNTIME_IMAGE) \
		$(if $(CACHE_REF),--cache-from type=registry$(comma)ref=$(CACHE_REF)) \
		$(if $(CACHE_REF),--cache-to type=registry$(comma)ref=$(CACHE_REF)$(comma)mode=max$(comma)image-manifest=true$(comma)oci-mediatypes=true) \
		--push \
		--sbom=true \
		--platform linux/$(ARCH) \
		--tag $(ECR)/$(IMAGE_NAME):$(ZULIP_VERSION)-$(ARCH)-$(SHORT_SHA) \
		$(DOCKER_BUILD_CONTEXT)

# CI BASE build: builds ONE target selected by BASE_TARGET (builder or runtime)
# for one ARCH. Jenkins calls this for both targets on both architectures.
# builder contains Python/Node build dependencies; runtime contains the
# installed Zulip runtime, production venv, and services.
# Pushes <base_version>-<target>-<arch>-<short_sha> to ECR with an SBOM, using
# CACHE_REF when set. Jenkins subsequently publishes shared multi-arch tags.
ci/base-build:
	@test "$(BASE_TARGET)" = builder -o "$(BASE_TARGET)" = runtime
	docker buildx build --file Dockerfile.base --target $(BASE_TARGET) \
		--progress=plain --platform linux/$(ARCH) --push --sbom=true \
		$(if $(CACHE_REF),--cache-from type=registry$(comma)ref=$(CACHE_REF)) \
		$(if $(CACHE_REF),--cache-to type=registry$(comma)ref=$(CACHE_REF)$(comma)mode=max$(comma)image-manifest=true$(comma)oci-mediatypes=true) \
		--tag $(ECR)/$(BASE_IMAGE_NAME):$(BASE_VERSION)-$(BASE_TARGET)-$(ARCH)-$(SHORT_SHA) \
		$(DOCKER_BUILD_CONTEXT)

# Shell into a freshly built local image for poking around.
run/interactive:
	@id=$$(docker run -d $(IMAGE_NAME):$(ZULIP_VERSION) sleep 99d) && docker exec -it $$id /bin/bash

clean:
	docker image rm $(IMAGE_NAME):$(ZULIP_VERSION) 2>/dev/null || true
