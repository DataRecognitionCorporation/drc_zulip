# Build targets for the DRC Zulip container image, following the moodle-pls
# cicd/build standard.
#
# `build`    - local single-arch image for iterating/testing.
# `ci/build` - what the container_build Jenkinsfile runs per architecture:
#              a buildx build that pushes a per-arch, SHA-pinned tag to ECR
#              with an SBOM attached. The container_build "Push Manifest" stage
#              then stitches the per-arch tags into the multi-arch manifests.
#
# Unlike moodle-pls, the Zulip image build is fully self-contained (the
# Dockerfile runs provision + build-release-tarball + install internally from
# the copied-in working tree), so there is no Artifactory host to pin -- the
# only build-arg is ZULIP_VERSION.
#
# NOTE: the build context is the REPOSITORY ROOT (where .git and tools/ live),
# not docker/. build-release-tarball archives HEAD and needs .git, and
# .dockerignore (at the repo root) keeps it. All targets therefore point buildx
# at `..` with `--file Dockerfile`.

# Variables
IMAGE_NAME := drc/pas/zulip
DOCKERFILE := Dockerfile
DOCKER_BUILD_CONTEXT := ..

# Version label baked into the image (ARG ZULIP_VERSION). Matches version.py.
ZULIP_VERSION ?= 9.2-drc

ECR ?= null
ARCH ?= null       # amd64 or arm64
SHORT_SHA ?= 0

.PHONY: build ci/build run/interactive clean

# Local single-arch build for testing (loads into the local docker images).
build:
	DOCKER_BUILDKIT=1 docker buildx build \
		--file $(DOCKERFILE) \
		--progress=plain \
		--build-arg ZULIP_VERSION=$(ZULIP_VERSION) \
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
