# Build targets for the DRC Zulip container image.
#
# `build`    - local single-arch image for iterating/testing.
# `ci/build` - native per-architecture code build, pushing a tag and SBOM.
#
# Reuse our provisioned bases and rebuild assets from the repository-root
# context. .git is needed to stamp the customized application version.

# Variables
# IMAGE_NAME is the repository path (without registry host). CI overrides it to
# the real ECR repository path via `make ci/build IMAGE_NAME=...`; the default
# below is only used for local `make build`.
IMAGE_NAME ?= drc/zulip
DOCKERFILE := Dockerfile
DOCKER_BUILD_CONTEXT := ..

# Version label baked into the image (ARG ZULIP_VERSION). Matches version.py.
ZULIP_VERSION ?= 9.2-drc
BASE_IMAGE_NAME ?= drc/zulip-base
BASE_VERSION ?= 9.2-drc
ZULIP_BUILDER_IMAGE ?= $(BASE_IMAGE_NAME):$(BASE_VERSION)-builder
ZULIP_RUNTIME_IMAGE ?= $(BASE_IMAGE_NAME):$(BASE_VERSION)-runtime
BASE_TARGET ?= builder
CACHE_REF ?=
comma := ,

ECR ?= null
ARCH ?= amd64
SHORT_SHA ?= 0

.PHONY: build ci/build base/build ci/base-build lint run/interactive clean

# Run Hadolint and fail on warnings or higher.
lint:
	docker run --rm -i -v "$(CURDIR):/work" -w /work hadolint/hadolint:v2.12.0 \
		hadolint --config .hadolint.yaml --failure-threshold warning $(DOCKERFILE) Dockerfile.base

# Local single-arch build for testing (loads into the local docker images).
build:
	DOCKER_BUILDKIT=1 docker buildx build \
		--file $(DOCKERFILE) \
		--progress=plain \
		--build-arg ZULIP_VERSION=$(ZULIP_VERSION) \
		--build-arg ZULIP_BUILDER_IMAGE=$(ZULIP_BUILDER_IMAGE) \
		--build-arg ZULIP_RUNTIME_IMAGE=$(ZULIP_RUNTIME_IMAGE) \
		--platform linux/$(ARCH) \
		--tag $(IMAGE_NAME):$(ZULIP_VERSION) \
		--load \
		$(DOCKER_BUILD_CONTEXT)

# CI per-arch build+push. Invoked once per ARCH on a native node, producing a
# tag of the form <version>-<arch>-<short_sha> that the manifest stage combines.
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

base/build:
	@for target in builder runtime; do \
		docker buildx build --file Dockerfile.base --target $$target \
			--progress=plain --platform linux/$(ARCH) --load \
			--tag $(BASE_IMAGE_NAME):$(BASE_VERSION)-$$target $(DOCKER_BUILD_CONTEXT) || exit $$?; \
	done

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
