# V1 Field Defect - Evidence First

Defect ID:
Test ID:
Severity - BLOCKER / HIGH / MEDIUM / LOW:
Build/commit / source digest / product version:
Date/time and UTC offset:
Camera (label reference, model, firmware, MAC/UUID as needed):
Starting topology (selected adapter, DHCP/static, PC/camera IP/prefix):

## Exact reproduction steps

1. Starting condition:
2. Technician action:
3. First observable divergence and timestamp:

Expected behavior (cite test criterion):
Observed behavior (facts only):
Screenshots (redacted paths):
PowerShell evidence (command, timestamp, output file):
Wireshark evidence if needed (interface, filter, time, packet numbers):
Support reference ID:
Safe Support Bundle file:
Task / foreground session correlation:
Recovery/cleanup state (snapshot retained? current addresses? Restore verified?):
Reproducibility (attempts / reproductions and changing conditions):
Suspected subsystem (hypothesis, not confirmed root cause):
Notes / next discriminating check:

## Severity definitions (15B.7)

- BLOCKER: prevents safe/useful V1 operation or risks incorrect network/device mutation.
- HIGH: major technician workflow broken or materially misleading.
- MEDIUM: functional problem with workaround.
- LOW: polish/non-critical usability issue.

Do not infer root cause from a generic error. Preserve the first failing observation, operation reference and timestamps. Compare application evidence before requesting packet capture. Never paste real passwords, credential-store secrets, authorization headers, cookies or unrelated PII. Unsupported capability truthfully excluded is NOT SUPPORTED, not a defect. Stop mutation tests if recovery/cleanup cannot be verified.
