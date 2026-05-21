{
  description = "Sticker Smith development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        electronLibs = pkgs.lib.optionals pkgs.stdenv.isLinux (
          with pkgs;
          [
            gtk3
            nss
            nspr
            alsa-lib
            libdrm
            mesa
            xorg.libX11
            xorg.libXcursor
            xorg.libXrandr
            xorg.libXi
            xorg.libXtst
            libxkbcommon
            at-spi2-atk
            at-spi2-core
            cups
            glib
            pango
            cairo
            libxcrypt-legacy
          ]
        );

        devTools =
          with pkgs;
          [
            (lib.hiPrio nodejs_22)
            pnpm
            prettier

            python312
            poetry
            python312Packages.pip

            ffmpeg
            pkg-config
            gcc
            gnumake
          ]
          ++ lib.optionals stdenv.isLinux [
            steam-run-free
          ];
      in
      {
        devShells.default = pkgs.mkShell {
          packages = devTools ++ electronLibs;

          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          PYTHONPATH = "./tg-webm-converter/src";
          STICKER_SMITH_PYTHONPATH = "./tg-webm-converter/src";

          shellHook = ''
            export PATH="${pkgs.lib.makeBinPath devTools}:$PATH"
            ${pkgs.lib.optionalString pkgs.stdenv.isLinux ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath electronLibs}:$LD_LIBRARY_PATH"
              export NIX_LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath electronLibs}:$NIX_LD_LIBRARY_PATH"
              export NIX_LD="${pkgs.stdenv.cc.bintools.dynamicLinker}"
            ''}

            echo "Sticker Smith shell"
            echo "node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo "prettier: $(prettier --version)"
            echo "steam-run: $(command -v steam-run)"
            echo "python: $(python --version)"
            echo "poetry: $(poetry --version)"
            echo "ffmpeg: $(ffmpeg -version | head -n1)"
          '';
        };
      }
    );
}
