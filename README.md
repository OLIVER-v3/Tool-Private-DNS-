# JX - Private DNS (Windows)

## Run (dev)
    npm install
    npm start

## Build the installer (JX Setup .exe)
Run on Windows (or let GitHub Actions do it):
    npm install
    npm run dist
Output: dist\JX Setup 1.0.0.exe  (installs per-machine, asks for Administrator)

## Notes
- Needs Administrator to change DNS (the installed app requests it automatically).
- DNS-over-HTTPS needs Windows 11.
- Replace build\icon.png (>=256x256) to change the app/installer icon.

## Build on GitHub (no PC needed)
Push this folder to a GitHub repo. The workflow in .github/workflows/build.yml
builds the installer on a Windows runner. Download it from the Actions tab
(Artifacts > JX-Setup), or push a tag like v1.0.0 to get it under Releases.
