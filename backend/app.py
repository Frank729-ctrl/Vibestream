from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import sqlite3
import os
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static')
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", engineio_options={'cors_allowed_origins': '*'})

# Initialize database
def init_db():
    logger.debug("Initializing database")
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        # Drop and recreate tables
        c.execute("DROP TABLE IF EXISTS polls")
        c.execute("DROP TABLE IF EXISTS users")
        c.execute("DROP TABLE IF EXISTS likes")
        c.execute('''CREATE TABLE polls 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, option TEXT UNIQUE, votes INTEGER)''')
        c.execute('''CREATE TABLE users 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, is_host BOOLEAN)''')
        c.execute('''CREATE TABLE likes 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, stream_id INTEGER)''')
        # Insert default poll options
        c.execute("INSERT INTO polls (option, votes) VALUES (?, ?)", ('Song A', 0))
        c.execute("INSERT INTO polls (option, votes) VALUES (?, ?)", ('Song B', 0))
        # Insert default host
        c.execute("INSERT INTO users (username, is_host) VALUES (?, ?)", ('HostUser', True))
        conn.commit()
        logger.debug("Database initialized successfully")
    except sqlite3.Error as e:
        logger.error(f"Database initialization error: {str(e)}")
    finally:
        conn.close()

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/poll', methods=['GET'])
def get_poll():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute("SELECT option, votes FROM polls")
        results = [{'option': row[0], 'votes': row[1]} for row in c.fetchall()]
        logger.debug(f"Fetched poll data: {results}")
        return jsonify(results)
    except sqlite3.Error as e:
        logger.error(f"Poll fetch error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.json
    username = data.get('username')
    logger.debug(f"Registering username: {username}")
    if not username:
        logger.warning("Username not provided")
        return jsonify({'error': 'Username required'}), 400
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        # Check if username exists
        c.execute("SELECT username, is_host FROM users WHERE username = ?", (username,))
        user = c.fetchone()
        if user:
            logger.debug(f"Returning existing user: {username}")
            socketio.emit('user_update', {'username': username, 'is_host': user[1]})
            return jsonify({'username': username, 'is_host': user[1]})
        # Insert new user
        is_host = (username == 'HostUser')
        c.execute("INSERT INTO users (username, is_host) VALUES (?, ?)", (username, is_host))
        conn.commit()
        logger.debug(f"Registered new user: {username} with is_host={is_host}")
        socketio.emit('user_update', {'username': username, 'is_host': is_host})
        return jsonify({'username': username, 'is_host': is_host})
    except sqlite3.Error as e:
        logger.error(f"Registration error for {username}: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/users', methods=['GET'])
def get_users():
    username = request.args.get('username')
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute("SELECT is_host FROM users WHERE username = ?", (username,))
        is_host = c.fetchone()
        if is_host and is_host[0]:
            c.execute("SELECT username, is_host FROM users")
            results = [{'username': row[0], 'is_host': row[1]} for row in c.fetchall()]
        else:
            results = []
        logger.debug(f"Fetched users for {username}: {results}")
        return jsonify(results)
    except sqlite3.Error as e:
        logger.error(f"Users fetch error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/likes', methods=['POST'])
def add_like():
    data = request.json
    username = data.get('username')
    stream_id = 1
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute("INSERT OR IGNORE INTO likes (username, stream_id) VALUES (?, ?)", (username, stream_id))
        conn.commit()
        c.execute("SELECT username FROM likes WHERE stream_id = ?", (stream_id,))
        likes = [row[0] for row in c.fetchall()]
        socketio.emit('likes_update', {'stream_id': stream_id, 'likes': likes})
        logger.debug(f"Broadcasted likes update: {likes}")
        return jsonify({'status': 'success'})
    except sqlite3.Error as e:
        logger.error(f"Like error for {username}: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/likes', methods=['GET'])
def get_likes():
    stream_id = 1
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute("SELECT username FROM likes WHERE stream_id = ?", (stream_id,))
        likes = [row[0] for row in c.fetchall()]
        logger.debug(f"Fetched likes: {likes}")
        return jsonify({'stream_id': stream_id, 'likes': likes})
    except sqlite3.Error as e:
        logger.error(f"Likes fetch error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    finally:
        conn.close()

@socketio.on('vote')
def handle_vote(data, sid=None):
    option = data.get('option')
    logger.debug(f"Processing vote for option: {option} from sid: {sid}")
    if not option:
        logger.warning("No option provided for vote")
        return
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute("UPDATE polls SET votes = votes + 1 WHERE option = ?", (option,))
        if c.rowcount == 0:
            logger.warning(f"No poll option found for: {option}")
        conn.commit()
        c.execute("SELECT option, votes FROM polls")
        results = [{'option': row[0], 'votes': row[1]} for row in c.fetchall()]
        logger.debug(f"Broadcasting poll update: {results}")
        socketio.emit('poll_update', results, namespace='/')
    except sqlite3.Error as e:
        logger.error(f"Vote error: {str(e)}")
    finally:
        conn.close()

if __name__ == '__main__':
    init_db()
    socketio.run(app, debug=True, port=5000)