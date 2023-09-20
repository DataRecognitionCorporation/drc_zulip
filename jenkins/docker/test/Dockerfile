FROM zulip/ci:jammy
USER root

RUN deluser --remove-home github \
    && useradd -s /bin/bash -u 1000 -d /home/github/ -m -G sudo github

COPY ./ /home/github/
RUN sudo chown -Rf github.github /home/github/*

RUN sudo mv /home/github/jenkins/docker/test/entrypoint.sh /entrypoint.sh \
    && sudo chmod +x /entrypoint.sh


USER github
CMD [ "/bin/sh", "/entrypoint.sh" ]