#!/bin/bash
set -e

# Install backend deps
cd Backend
pip install -r requirements.txt

# Install frontend deps
cd ../frontend-package
npm install

# Back to root & install concurrently if missing
cd ..
npm install --save-dev concurrently

# Run both servers together
npx concurrently \
  "python3 Backend/app.py" \
  "cd frontend-package && npx vite --port 8080"
