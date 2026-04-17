FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG TARGETARCH
ARG USERNAME=vscode
ARG USER_UID=1001
ARG USER_GID=${USER_UID}
ARG MISE_VERSION=v2026.3.10

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    DEBIAN_FRONTEND=${DEBIAN_FRONTEND}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        autoconf \
        bison \
        build-essential \
        ca-certificates \
        curl \
        file \
        git \
        jq \
        libasound2t64 \
        libatk-bridge2.0-0t64 \
        libatk1.0-0t64 \
        libatspi2.0-0t64 \
        libbz2-dev \
        libcairo2 \
        libcups2t64 \
        libdb-dev \
        libdbus-1-3 \
        libdrm2 \
        libffi-dev \
        libfontconfig1 \
        libfreetype6 \
        libgbm1 \
        libgdbm-dev \
        libglib2.0-0t64 \
        libgmp-dev \
        liblzma-dev \
        libncurses-dev \
        libnspr4 \
        lmodern \
        libnss3 \
        libpango-1.0-0 \
        libreadline-dev \
        librsvg2-bin \
        libssl-dev \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        libyaml-dev \
        pkg-config \
        procps \
        patch \
        rustc \
        sudo \
        texlive-fonts-recommended \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-xetex \
        unzip \
        uuid-dev \
        xvfb \
        xfonts-cyrillic \
        xfonts-scalable \
        xz-utils \
        zip \
        zlib1g-dev \
        fonts-freefont-ttf \
        fonts-ipafont-gothic \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-tlwg-loma-otf \
        fonts-unifont \
        fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

RUN if ! getent group ${USER_GID} >/dev/null; then groupadd --gid ${USER_GID} ${USERNAME}; fi \
    && if ! id -u ${USERNAME} >/dev/null 2>&1; then useradd --uid ${USER_UID} --gid ${USER_GID} -m ${USERNAME}; fi \
    && usermod -aG sudo ${USERNAME} \
    && echo "${USERNAME} ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME} \
    && chmod 0440 /etc/sudoers.d/${USERNAME}

RUN case "${TARGETARCH}" in \
        amd64) asset="mise-${MISE_VERSION}-linux-x64" ;; \
        arm64) asset="mise-${MISE_VERSION}-linux-arm64" ;; \
        *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/${asset}" -o /usr/local/bin/mise \
    && chmod +x /usr/local/bin/mise

RUN cat <<'EOF' >/usr/local/bin/asdf
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "reshim" ]]; then
  exec mise reshim
fi

echo "This container uses mise instead of asdf; only 'asdf reshim' is supported." >&2
exit 1
EOF
RUN chmod +x /usr/local/bin/asdf

WORKDIR /workspaces/speedshop
USER ${USERNAME}
