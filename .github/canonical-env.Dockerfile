ARG RUBY_VERSION=4.0.2
FROM ruby:${RUBY_VERSION}

ARG DEBIAN_FRONTEND=noninteractive
ARG TARGETARCH
ARG MISE_VERSION=v2026.3.10

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    DEBIAN_FRONTEND=${DEBIAN_FRONTEND} \
    MISE_DISABLE_TOOLS=ruby

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libfontconfig1 \
        libfreetype6 \
        libgbm1 \
        libglib2.0-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        librsvg2-bin \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        lmodern \
        texlive-fonts-recommended \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-xetex \
        unzip \
        xvfb \
        xz-utils \
        fonts-freefont-ttf \
        fonts-ipafont-gothic \
        fonts-liberation \
        fonts-noto-color-emoji \
        fonts-tlwg-loma-otf \
        fonts-unifont \
        fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
        amd64) asset="mise-${MISE_VERSION}-linux-x64" ;; \
        arm64) asset="mise-${MISE_VERSION}-linux-arm64" ;; \
        *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/${asset}" -o /usr/local/bin/mise \
    && chmod +x /usr/local/bin/mise

WORKDIR /workspaces/speedshop
