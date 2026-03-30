#!/bin/bash
# Test API nhận số từ website: POST /api/public/lead
# Cần: API key của chiến dịch (lấy từ HCRM > Marketing > Chiến dịch > Tích hợp API)
# Cách chạy: ./scripts/test-public-lead-api.sh YOUR_API_KEY
# Hoặc: curl -X POST "http://localhost:5000/api/public/lead" -H "Content-Type: application/json" -H "X-API-Key: YOUR_API_KEY" -d '{"phone":"0901234567","name":"Nguyen Van A"}'

API_KEY="${1:-}"
BASE_URL="${2:-http://localhost:5000}"
if [ -z "$API_KEY" ]; then
  echo "Usage: $0 <API_KEY> [BASE_URL]"
  echo "Example: $0 mkt_abc123 http://localhost:5000"
  exit 1
fi

curl -s -X POST "${BASE_URL}/api/public/lead" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"phone":"0901234567","name":"Nguyen Van A","email":"test@example.com","note":"Test từ script"}' | jq .
