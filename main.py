import requests
import os
from dotenv import load_dotenv


load_dotenv(override=True)

verify_now_api_key = os.getenv('VERIFY_NOW_API_KEY')
verify_base_url = os.getenv('VERIFY_BASE_URL')
idempotency_id_key = os.getenv('Idempotency_id_key')
my_credits_endpoint = '/my_credits'
every_endpoint = '/verify'

header_details = {
    'x-api-key': f'{verify_now_api_key}',
    'Content-Type': 'application/json',
    'Idempotency-Key': f'{idempotency_id_key}'
    }

def main():
    resp = requests.post(
    url=f'{verify_base_url}{every_endpoint}',
    headers= {
        'x-api-key': f'{verify_now_api_key}',
        'Content-Type': 'application/json',
        'Idempotency-Key': f'{idempotency_id_key}'
        },
    json={
        "reportType": "said_verification",
        "idNumber": "",
        "mode": "production"
        }
    )
    response = resp.json()
    print(response)
    ##if response['Status'] == 'Success':
    ##    print(f"Credits: {response['credits']}")


if __name__ == "__main__":
    main()
