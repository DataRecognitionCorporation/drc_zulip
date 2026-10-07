# Build targets for the DRC Zulip container image.
#
# `build`    - local single-arch image for iterating/testing.
# `ci/build` - amd64 build run by CI, pushing a SHA-pinned tag and SBOM.
#
# Reuse the upstream runtime and rebuild assets from the repository-root
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
ZULIP_BASE_IMAGE ?= zulip/docker-zulip:9.2-0@sha256:319c9f1c5f0fd73f1e65ac4e86fca2853bc933105c58d0af98224d9c7a2709dc
CACHE_REF ?=
comma := ,

ECR ?= null
# The upstream 9.2-0 image is amd64-only.
ARCH ?= amd64
SHORT_SHA ?= 0

.PHONY: build ci/build lint run/interactive clean

# Run Hadolint and fail on warnings or higher.
lint:
	docker run --rm -i -v "$(CURDIR):/work" -w /work hadolint/hadolint:v2.12.0 \
		hadolint --config .hadolint.yaml --failure-threshold warning $(DOCKERFILE)

# Local single-arch build for testing (loads into the local docker images).
build:
	DOCKER_BUILDKIT=1 docker buildx build \
		--file $(DOCKERFILE) \
		--progress=plain \
		--build-arg ZULIP_VERSION=$(ZULIP_VERSION) \
		--build-arg ZULIP_BASE_IMAGE=$(ZULIP_BASE_IMAGE) \
		--platform linux/amd64 \
		--tag $(IMAGE_NAME):$(ZULIP_VERSION) \
		--load \
		$(DOCKER_BUILD_CONTEXT)

# CI per-arch build+push. Invoked once per ARCH on a native node, producing a
# tag of the form <version>-<arch>-<short_sha> that the manifest stage combines.
ci/build:
	@test "$(ARCH)" = amd64 || { echo "The upstream 9.2-0 base supports only amd64." >&2; exit 1; }
	DOCKER_BUILDKIT=1 docker buildx build \
		--file $(DOCKERFILE) \
		--progress=plain \
		--build-arg ZULIP_VERSION=$(ZULIP_VERSION) \
		--build-arg ZULIP_BASE_IMAGE=$(ZULIP_BASE_IMAGE) \
		$(if $(CACHE_REF),--cache-from type=registry$(comma)ref=$(CACHE_REF)) \
		$(if $(CACHE_REF),--cache-to type=registry$(comma)ref=$(CACHE_REF)$(comma)mode=max$(comma)image-manifest=true$(comma)oci-mediatypes=true) \
		--push \
		--sbom=true \
		--platform linux/$(ARCH) \
		--tag $(ECR)/$(IMAGE_NAME):$(ZULIP_VERSION)-$(ARCH)-$(SHORT_SHA) \
		$(DOCKER_BUILD_CONTEXT)

# Shell into a freshly built local image for poking around.
run/interactive:
	@id=$$(docker run -d $(IMAGE_NAME):$(ZULIP_VERSION) sleep 99d) && docker exec -it $$id /bin/bash

clean:
	docker image rm $(IMAGE_NAME):$(ZULIP_VERSION) 2>/dev/null || true
