import os
import json
import uuid
import time
import requests
import boto3


def handler(event: dict, context) -> dict:
    """Генерирует картинку через Hugging Face (FLUX.1-schnell) и загружает в S3"""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400'}, 'body': ''}

    body = json.loads(event.get('body') or '{}')
    prompt = body.get('prompt', '').strip()
    if not prompt:
        return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'prompt required'})}

    token = os.environ['HUGGINGFACE_TOKEN']

    models = [
        'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
        'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0',
        'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-2-1',
    ]

    img_data = None
    last_error = ''

    for model_url in models:
        print(f'[generate-image] trying model: {model_url}')
        for attempt in range(3):
            resp = requests.post(
                model_url,
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json',
                },
                json={'inputs': prompt, 'options': {'wait_for_model': True}},
                timeout=90
            )
            print(f'[generate-image] attempt={attempt+1} status={resp.status_code} content_type={resp.headers.get("content-type","")} body_preview={resp.text[:200]}')

            if resp.status_code == 200 and resp.content:
                content_type = resp.headers.get('content-type', '')
                if 'image' in content_type or resp.content[:4] in (b'\xff\xd8\xff\xe0', b'\xff\xd8\xff\xe1', b'\x89PNG'):
                    img_data = resp.content
                    break

            if resp.status_code == 503:
                try:
                    wait_data = resp.json()
                    wait_time = min(wait_data.get('estimated_time', 20), 25)
                    print(f'[generate-image] model loading, waiting {wait_time}s...')
                    time.sleep(wait_time)
                    continue
                except Exception:
                    time.sleep(15)
                    continue

            last_error = f'HTTP {resp.status_code}: {resp.text[:300]}'
            break

        if img_data:
            break

    if not img_data:
        print(f'[generate-image] all models failed, last_error={last_error}')
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'generation failed', 'detail': last_error})
        }

    key = f'lumen-images/{uuid.uuid4()}.jpg'
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY']
    )
    s3.put_object(Bucket='files', Key=key, Body=img_data, ContentType='image/jpeg')
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/files/{key}"
    print(f'[generate-image] success, url={cdn_url}')

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'url': cdn_url})
    }