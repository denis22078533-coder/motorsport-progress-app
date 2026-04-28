import os
import json
import uuid
import base64
import time
import requests
import boto3


def handler(event: dict, context) -> dict:
    """Генерирует картинку через Fusionbrain (Kandinsky) и загружает в S3"""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400'}, 'body': ''}

    body = json.loads(event.get('body') or '{}')
    prompt = body.get('prompt', '').strip()
    if not prompt:
        return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'prompt required'})}

    api_key = os.environ['FUSIONBRAIN_API_KEY']
    secret_key = os.environ['FUSIONBRAIN_SECRET_KEY']
    base_url = 'https://api-key.fusionbrain.ai/'

    # Получаем список моделей
    models_resp = requests.get(
        base_url + 'key/api/v1/models',
        headers={'X-Key': f'Key {api_key}', 'X-Secret': f'Secret {secret_key}'},
        timeout=15
    )
    models = models_resp.json()
    model_id = models[0]['id']

    # Запускаем генерацию
    params = {
        "type": "GENERATE",
        "numImages": 1,
        "width": 1024,
        "height": 1024,
        "generateParams": {"query": prompt}
    }
    gen_resp = requests.post(
        base_url + 'key/api/v1/text2image/run',
        headers={'X-Key': f'Key {api_key}', 'X-Secret': f'Secret {secret_key}'},
        files={
            'model_id': (None, str(model_id)),
            'params': (None, json.dumps(params), 'application/json')
        },
        timeout=30
    )
    task_id = gen_resp.json().get('uuid')
    if not task_id:
        return {'statusCode': 500, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'generation start failed', 'detail': gen_resp.json()})}

    # Поллим результат
    image_b64 = None
    for _ in range(20):
        time.sleep(5)
        check = requests.get(
            base_url + f'key/api/v1/text2image/status/{task_id}',
            headers={'X-Key': f'Key {api_key}', 'X-Secret': f'Secret {secret_key}'},
            timeout=15
        )
        data = check.json()
        if data.get('status') == 'DONE':
            image_b64 = data['images'][0]
            break
        elif data.get('status') == 'FAIL':
            return {'statusCode': 500, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'generation failed'})}

    if not image_b64:
        return {'statusCode': 504, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'timeout'})}

    # Загружаем в S3
    img_data = base64.b64decode(image_b64)
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
