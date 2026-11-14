"""Read-only Linux syntax validation. Never installs or invokes service scripts."""
import ast
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
scripts = sorted((root / "deploy").rglob("*.sh"))
for script in scripts:
    subprocess.run(["bash", "-n", str(script)], check=True)
python_files = sorted((root / "deploy").rglob("*.py"))
for script in python_files:
    ast.parse(script.read_text(), filename=str(script))
# Execute only the extracted orchestration functions with fake service/Node
# functions. Never source/apply the guarded release runner or invoke systemctl.
release = (root / "deploy/ubuntu/release.sh").read_text()
functions = release.split("restart() {", 1)[1].split('\nif [[ -e "$base/.current-new"', 1)[0]
functions = "restart() {" + functions
functions = functions.replace("/opt/vetthevat/node/bin/node", "vtv_node")
with tempfile.TemporaryDirectory(prefix="vtv-orchestration-") as directory:
    target = Path(directory)
    (target / "release.json").write_text('{"id":"synthetic-release"}')
    mocks = 'set -e\nsystemctl(){ printf "SERVICE %s\\n" "$*"; }\nvtv_node(){ printf "PROBE %s\\n" "$*"; }\nprofile=production\nnode_role=all\n'
    output = subprocess.check_output(["bash", "-c", mocks + functions + '\nrestart\nsmoke "$1"\n', "vtv-fixture", str(target)], text=True)
    lines = output.splitlines()
    assert len([line for line in lines if line.startswith("SERVICE ")]) == 12
    assert lines[0] == "SERVICE stop vetthevat-mail-production.service"
    assert lines[5] == "SERVICE restart vetthevat-processing@production.service"
    assert lines[6] == "SERVICE restart vetthevat-web@production.service"
    assert any("smoke.cjs" in line and "worker-smoke" not in line for line in lines if line.startswith("PROBE "))
    assert any("worker-smoke.cjs production synthetic-release" in line for line in lines)
print(json.dumps({"bashSyntaxPassed": len(scripts), "pythonSyntaxPassed": len(python_files), "sameHostOrchestrationMockPassed": True, "serviceActions": 0, "databaseChanges": 0, "nginxRuntimeTested": False, "systemdRuntimeTested": False}))
