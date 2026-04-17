#!/usr/bin/env bash
set -euo pipefail

plugin_url="https://github.com/asdf-vm/asdf-ruby.git"
ruby_tool="${1:-ruby}"

# Fresh CI homes do not have the ruby shorthand registry entry available, so
# install the plugin from its canonical URL before asking mise to install Ruby.

if ! mise plugins ls --user --urls | awk '$1 == "ruby" { found = 1 } END { exit !found }'; then
  mise plugins install ruby "$plugin_url"
fi

mise install "$ruby_tool"
