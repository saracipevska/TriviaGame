from flask import Flask, render_template, jsonify, request, send_file
import io
import json
import os
import socket
import threading
import time

import qrcode
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

QUESTIONS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'Questions', 'questions.json')
PORT = 5000

# ══════════════════════════════════════════════════════════
# Buzzer queue — in-memory shared state
# ══════════════════════════════════════════════════════════
buzz_lock = threading.Lock()
buzz_state = {'queue': []}  # list of {'name': str, 'ts': float}


def get_local_ip():
    """Best-effort discovery of this machine's LAN IP so phones on the
    same Wi-Fi network can reach the server. Falls back to localhost."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/buzzer')
def buzzer_page():
    return render_template('buzzer.html')


@app.route('/api/questions')
def get_questions():
    if not os.path.exists(QUESTIONS_FILE):
        return jsonify({'error': 'questions.json not found in the app directory'}), 404
    try:
        with open(QUESTIONS_FILE, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
        return jsonify(data)
    except json.JSONDecodeError as e:
        return jsonify({'error': f'Invalid JSON: {str(e)}'}), 400


def get_buzzer_url():
    """Builds the buzzer URL from the incoming request itself, so it works
    both locally (LAN IP:5000) and when deployed (public host, correct
    scheme/port), instead of guessing via get_local_ip()."""
    return f'{request.url_root.rstrip("/")}/buzzer'


@app.route('/api/join-info')
def join_info():
    return jsonify({'url': get_buzzer_url()})


@app.route('/api/qr.png')
def qr_png():
    url = get_buzzer_url()
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    response = send_file(buf, mimetype='image/png')
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.route('/api/buzz', methods=['POST'])
def buzz():
    data = request.get_json(silent=True) or {}
    name = str(data.get('name', '')).strip()[:30]
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    with buzz_lock:
        for i, entry in enumerate(buzz_state['queue']):
            if entry['name'] == name:
                return jsonify({'ok': True, 'position': i + 1, 'already': True})
        buzz_state['queue'].append({'name': name, 'ts': time.time()})
        position = len(buzz_state['queue'])
    return jsonify({'ok': True, 'position': position, 'already': False})


@app.route('/api/buzz/queue')
def buzz_queue():
    with buzz_lock:
        names = [entry['name'] for entry in buzz_state['queue']]
    return jsonify({'queue': names})


@app.route('/api/buzz/reset', methods=['POST'])
def buzz_reset():
    with buzz_lock:
        buzz_state['queue'] = []
    return jsonify({'ok': True})


if __name__ == '__main__':
    lan_ip = get_local_ip()
    print()
    print('=' * 52)
    print('   TRIVIA GAME  -  Local Server')
    print('=' * 52)
    print('   Host — open your browser and go to:')
    print(f'   http://localhost:{PORT}')
    print()
    print('   Players — scan the in-game QR code, or open:')
    print(f'   http://{lan_ip}:{PORT}/buzzer')
    print('=' * 52)
    print()
    app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
