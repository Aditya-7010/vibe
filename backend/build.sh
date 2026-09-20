#!/usr/bin/env bash
# Build script for Render (or any host that runs a build command).
set -o errexit
cd "$(dirname "$0")"

pip install -r requirements.txt

# Creates the initial migrations the first time; a no-op once you've committed
# the generated files to git.
python manage.py makemigrations accounts rooms --noinput
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py seed_rooms
