 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index a2b18bf19d71624e4f027b2e1e535b67187af34c..cf9b9125359786791db8e57382d54ea4d6ec759b 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,12 @@
-# nextphase-trading-frontend
\ No newline at end of file
+# nextphase-trading-frontend
+
+Static HTML + CSS landing page for NextPhase Trading.
+
+## Getting started
+
+Open `index.html` directly in your browser or serve the folder with any static
+HTTP server.
+
+```bash
+python -m http.server
+```
 
EOF
)
