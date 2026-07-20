#!/bin/sh
set -e

# Create all upload subdirectories after the bind-mount volume is available.
mkdir -p /app/uploads/expenses \
         /app/uploads/payslips \
         /app/uploads/profile-photos \
         /app/uploads/employee-docs \
         /app/uploads/resumes \
         /app/uploads/documents

# The /app/uploads bind mount takes its ownership from the host, which overrides
# the build-time chown. When running as root, repair ownership so the unprivileged
# nodeuser (uid 1001) can write PDFs/documents. This self-heals the EACCES errors
# that occur when the host dir is owned by root/ubuntu.
if [ "$(id -u)" = "0" ]; then
  chown -R nodeuser:nodegroup /app/uploads || true
  # Drop privileges and run the app as nodeuser.
  exec su-exec nodeuser:nodegroup dumb-init -- node server.js
fi

# Already unprivileged (e.g. local run) — just start.
exec dumb-init -- node server.js
