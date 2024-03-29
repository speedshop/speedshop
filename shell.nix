with import <nixpkgs> {};

let
  h2o = stdenv.mkDerivation rec {
    pname   = "h2o";
    version = "2.3.0-beta2";

    src = fetchFromGitHub {
      owner  = "h2o";
      repo   = "h2o";
      rev    = "refs/tags/v${version}";
      sha256 = "0lwg5sfsr7fw7cfy0hrhadgixm35b5cgcvlhwhbk89j72y1bqi6n";
    };

    outputs = [ "out" "man" "dev" "lib" ];

    nativeBuildInputs = [ pkg-config cmake ninja ];
    buildInputs = [ openssl libuv zlib ];

    meta = with lib; {
      description = "Optimized HTTP/1 and HTTP/2 server";
      homepage    = "https://h2o.examp1e.net";
      license     = licenses.mit;
      maintainers = with maintainers; [ thoughtpolice ];
      platforms   = platforms.all;
    };
  };

in mkShell {
  packages = [
    ruby_3_1
    git
    gcc
    bundix
    h2o
    terraform
    openssl
  ];
}
