"""Assemble the local Codex marketplace from a pinned upstream release."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

UPSTREAM = "https://github.com/ummydev/codexdesign.git"
TAG = "desktop-v0.2.2"
COMMIT = "0f31bd472d74813dafc2585c6ff61ae45180f678"
PLUGIN = "codex-design-markup"
MARKETPLACE = "codex-design-markup-local"
ROOT = Path(__file__).resolve().parent


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build(output):
    if output.exists():
        raise SystemExit(f"Output already exists: {output}. Choose a new --out directory.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".codex-markup-", dir=output.parent) as tmp:
        workspace = Path(tmp)
        checkout = workspace / "upstream"
        subprocess.run(
            ["git", "-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", TAG, UPSTREAM, str(checkout)],
            check=True,
        )
        commit = subprocess.check_output(
            ["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True
        ).strip()
        if commit != COMMIT:
            raise SystemExit(f"Upstream tag {TAG} resolved to {commit}. Expected {COMMIT}.")

        marketplace = workspace / "marketplace"
        package = marketplace / "plugins" / PLUGIN
        shutil.copytree(checkout / "plugins" / "codexdesign", package)
        subprocess.run([sys.executable, str(ROOT / "apply_markup.py"), str(package)], check=True)

        manifest_path = package / ".codex-plugin" / "plugin.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["name"] = PLUGIN
        manifest["description"] = "Codex Design canvas with numbered screenshots and annotation drafts."
        manifest["interface"].update(
            displayName="Codex Design Markup",
            shortDescription="Draw and review numbered canvas annotations.",
            longDescription="Add color-coded notes and shapes to Codex Design previews, then prepare numbered screenshots and an editable draft for the linked Codex chat.",
            developerName="SuperShallot",
        )
        write_json(manifest_path, manifest)

        # Keep the upstream launchers and apply the supported launcher for this platform.
        if os.name == "nt":
            shutil.copy2(package / ".mcp.windows.json", package / ".mcp.json")

        build_id = hashlib.sha256(COMMIT.encode())
        for entry in sorted((ROOT / "src").iterdir()):
            if entry.is_file():
                build_id.update(entry.read_bytes())
        for name in ("apply_markup.py", "build.py"):
            build_id.update((ROOT / name).read_bytes())
        (package / "dist" / "build-id").write_text("markup-" + build_id.hexdigest()[:20] + "\n", encoding="utf-8")

        shutil.copy2(ROOT / "README.md", marketplace / "README.md")
        shutil.copy2(ROOT / "NOTICE.md", package / "MODIFICATIONS.md")
        shutil.copy2(ROOT / "LICENSE", marketplace / "LICENSE")
        write_json(marketplace / ".agents" / "plugins" / "marketplace.json", {
            "name": MARKETPLACE,
            "interface": {"displayName": "Codex Design Markup"},
            "plugins": [{
                "name": PLUGIN,
                "source": {"source": "local", "path": f"./plugins/{PLUGIN}"},
                "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
                "category": "Productivity",
            }],
        })
        marketplace.replace(output)
    print(f"Built local marketplace at {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "build" / "marketplace")
    args = parser.parse_args()
    build(args.out.resolve())


if __name__ == "__main__":
    main()
