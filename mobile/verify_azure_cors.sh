#!/bin/bash
set -e

API_URL="https://team21-ca.livelycoast-bbf4360d.southafricanorth.azurecontainerapps.io"
ORIGIN="http://localhost:8081"

echo "Testing CORS preflight"
curl -s -D - -o /dev/null -X OPTIONS \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  "$API_URL/api/v1/validate-id"

echo ""
echo "Testing actual POST"
curl -s -D - -o /dev/null -X POST \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -d '{"id_number":"0610067120085"}' \
  "$API_URL/api/v1/validate-id"