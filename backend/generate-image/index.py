import os
import json
import uuid
import base64
import requests
import boto3

def handler(event: dict, context) -> dict:
    """Генерирует картинку через FLUX и загружает в S3, возвращает CDN URL"""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400'}, 'body': ''}

    body = json.loads(event.get('body') or '{}')
    prompt = body.get('prompt', '').strip()
    if not prompt:
        return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'prompt required'})}

    # Генерируем через FLUX API
    flux_resp = requests.post(
        'https://api.bfl.ml/v1/flux-pro-1.1',
        headers={
            'Content-Type': 'application/json',
            'X-Key': os.environ['FLUX_API_KEY'],
        },
        json={
            'prompt': prompt,
            'width': 1024,
            'height': 1024,
        },
        timeout=60
    )
    flux_data = flux_resp.json()
    task_id = flux_data.get('id')
    if not task_id:
        return {'statusCode': 500, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'FLUX task failed', 'detail': flux_data})}

    # Поллим результат
    import time
    image_url = None
    for _ in range(30):
        time.sleep(3)
        poll = requests.get(
            f'https://api.bfl.ml/v1/get_result?id={task_id}',
            headers={'X-Key': os.environ['FLUX_API_KEY']},
            timeout=15
        )
        result = poll.json()
        status = result.get('status')
        if status == 'Ready':
            image_url = result['result']['sample']
            break
        elif status in ('Error', 'Failed'):
            return {'statusCode': 500, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'FLUX generation failed'})}

    if not image_url:
        return {'statusCode': 504, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'FLUX timeout'})}

    # Скачиваем картинку и загружаем в S3
    img_resp = requests.get(image_url, timeout=30)
    img_data = img_resp.content

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
