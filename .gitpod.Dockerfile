# See here for image contents: https://github.com/microsoft/vscode-dev-containers/tree/v0.134.0/containers/javascript-node/.devcontainer/base.Dockerfile
ARG VARIANT="14"
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:0-${VARIANT}
USER root
RUN addgroup --gid 33333 gitpod && \
    useradd --no-log-init --create-home --home-dir /home/gitpod --shell /bin/bash --uid 33333 --gid 33333 gitpod && \
    echo "gitpod:gitpod" | chpasswd && \
    cp -R /root/. /home/gitpod && \
    chown -R gitpod:gitpod /home/gitpod && \
    echo "gitpod ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/gitpod
ENV NODE_OPTIONS=--max_old_space_size=8192 LOGGING=true TRUST_ICM=true
RUN sudo -u node npm install --ignore-scripts -g @angular/cli
