FROM zulip/ci:jammy
# RUN yum install -y lxc lxc-utils


COPY ./ /home/github/
RUN sudo chown -Rf github.github /home/github/*
RUN sudo mv /home/github/jenkins/entrypoint.sh /entrypoint.sh \
    && chmod +x /entrypoint.sh


CMD [ "/bin/sh", "/entrypoint.sh" ]