#!/bin/bash
# Usage: ./update_version.sh <new_version>
# FORMAT IS <0.0.0>

if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  current_version=$(node -p "require('./package.json').version")
  perl -i -pe "s/\"version\": \"$current_version\"/\"version\": \"$1\"/" package.json

  echo "Updated versions to $1";
else
  echo "Version format <$1> isn't correct, proper format is <0.0.0>";
fi
