import os
import json
import uuid
import base64
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

    resp = requests.post(
        'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        json={'inputs': prompt},
        timeout=60
    )

    if resp.status_code != 200:
        return {'statusCode': 500, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'generation failed', 'detail': resp.text[:300]})}

    img_data = resp.content
    key = f'lumen-images/{uuid.uuid4()}.jpg'
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY']
    )
    s3.put_object(Bucket='files', Key=key, Body=img_data, ContentType='image/jpeg')
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/files/{key}"

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'url': cdn_url})
    }