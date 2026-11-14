#!/bin/bash
# Build and replace this product only. Preferences are retained; old bundles
# go to Trash. Safari quits so it cannot continue running an old worker.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"
node tools/build-extension.mjs
xcodebuild -project SwarmCursors.xcodeproj -scheme SwarmCursors \
  -destination 'generic/platform=macOS' -configuration Debug \
  -derivedDataPath /tmp/swarm-v05-install-build build > /tmp/swarm-fidelity-macos.log 2>&1
python3 - <<'PY'
from pathlib import Path
import datetime, hashlib, os, plistlib, re, shutil, signal, subprocess
built=Path('/tmp/swarm-v05-install-build/Build/Products/Debug/Swarm Cursors.app').resolve()
installed=Path('/Users/erico/Applications/Swarm Cursors.app')
resource=Path('Contents/PlugIns/Swarm Cursors Extension.appex/Contents/Resources')
for f in ['manifest.json','background.js','content/swarm.js','content/mask.js']:
 assert (built/resource/f).read_bytes()==(Path('web-extension')/f).read_bytes(),f
subprocess.run(['codesign','--verify','--deep','--strict',str(built)],check=True)
for line in subprocess.check_output(['ps','-axo','pid=,comm='],text=True).splitlines():
 parts=line.strip().split(None,1)
 if len(parts)!=2:continue
 if parts[1] in [str(installed/'Contents/MacOS/Swarm Cursors'),'/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari']:
  os.kill(int(parts[0]),signal.SIGTERM)
registered=subprocess.check_output(['pluginkit','-m','-A','-D','-v','-i','com.Erico.SwarmCursors.Extension'],text=True)
apps={installed,built}
for line in registered.splitlines():
 match=re.search(r'(/[^\n]+\.appex)',line)
 if match:apps.add(Path(match.group(1)).parents[2].resolve())
ls='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
for i,old in enumerate(sorted(apps)):
 if not old.exists():continue
 assert plistlib.loads((old/'Contents/Info.plist').read_bytes())['CFBundleIdentifier']=='com.Erico.SwarmCursors'
 subprocess.run(['pluginkit','-r',str(old/'Contents/PlugIns/Swarm Cursors Extension.appex')],check=False)
 subprocess.run([ls,'-u',str(old)],check=False)
 if old!=built:
  backup=Path.home()/'.Trash'/f'Swarm Cursors-old-{stamp}-{i}.app'
  shutil.move(str(old),str(backup));print('OLD -> Trash:',backup)
installed.parent.mkdir(exist_ok=True)
subprocess.run(['ditto',str(built),str(installed)],check=True)
subprocess.run([ls,'-f',str(installed)],check=True)
subprocess.run(['pluginkit','-a',str(installed/'Contents/PlugIns/Swarm Cursors Extension.appex')],check=True)
for f in ['content/swarm.js','content/mask.js']:
 assert (installed/resource/f).read_bytes()==(Path('web-extension')/f).read_bytes()
 print(f,hashlib.sha256((installed/resource/f).read_bytes()).hexdigest())
print('INSTALLED:',installed)
PY
/usr/bin/open '/Users/erico/Applications/Swarm Cursors.app'
/usr/bin/open -a Safari
pluginkit -m -A -D -v -i com.Erico.SwarmCursors.Extension
