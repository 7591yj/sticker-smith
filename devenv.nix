{ pkgs, ... }:

{
  packages = with pkgs; [
    bun
    nodejs_22
    nodePackages.prettier
    steam-run-free
    python312
    poetry
    ffmpeg
    pkg-config
    gcc
    gnumake
    python312Packages.pip
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
  ];

  env = {
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    PYTHONPATH = "./tg-webm-converter/src";
    STICKER_SMITH_PYTHONPATH = "./tg-webm-converter/src";
  };

  enterShell = ''
    export LD_LIBRARY_PATH="${
      pkgs.lib.makeLibraryPath [
        pkgs.gtk3
        pkgs.nss
        pkgs.nspr
        pkgs.alsa-lib
        pkgs.libdrm
        pkgs.mesa
        pkgs.xorg.libX11
        pkgs.xorg.libXcursor
        pkgs.xorg.libXrandr
        pkgs.xorg.libXi
        pkgs.xorg.libXtst
        pkgs.libxkbcommon
        pkgs.at-spi2-atk
        pkgs.at-spi2-core
        pkgs.cups
        pkgs.glib
        pkgs.pango
        pkgs.cairo
        pkgs.libxcrypt-legacy
      ]
    }:$LD_LIBRARY_PATH"

    echo "Sticker Smith shell"
    echo "bun: $(bun --version)"
    echo "prettier: $(prettier --version)"
    echo "steam-run: $(command -v steam-run)"
    echo "python: $(python --version)"
    echo "poetry: $(poetry --version)"
    echo "ffmpeg: $(ffmpeg -version | head -n1)"
  '';
}
