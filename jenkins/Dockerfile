FROM zulip/ci:jammy
# RUN yum install -y lxc lxc-utils

# syntax=docker/dockerfile:latest
USER root

RUN deluser --remove-home github \
    && useradd -s /bin/bash -u 1000 -d /home/github/ -m -G sudo github


USER github
# COPY ./ /home/github/
# RUN sudo chown -Rf github.github /home/github/*
# RUN sudo mv /home/github/jenkins/entrypoint.sh /entrypoint.sh \
#     && chmod +x /entrypoint.sh


# CMD [ "/bin/sh", "/entrypoint.sh" ]