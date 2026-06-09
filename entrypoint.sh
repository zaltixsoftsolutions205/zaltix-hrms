#!/bin/sh
# Create all upload subdirectories after bind-mount volume is available
mkdir -p /app/uploads/expenses \
         /app/uploads/payslips \
         /app/uploads/profile-photos \
         /app/uploads/employee-docs \
         /app/uploads/resumes \
         /app/uploads/documents

exec dumb-init -- node server.js
