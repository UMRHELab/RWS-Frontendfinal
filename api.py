# need to pip install flask and pip install flask-cors to run this
from flask import Flask, request, jsonify
from flask_cors import CORS
import pymysql
import numpy as np
import json

app = Flask(__name__)
CORS(app)

def get_connection():
    """Get database connection to php MySQL database."""
    return pymysql.connect(
        host="webapps3-db.miserver.it.umich.edu",
        user="rws_data_test",
        password="7N22Mn5V_y",
        database="rws_data_test",
        charset="utf8mb4",
        init_command="SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        cursorclass=pymysql.cursors.DictCursor
    )

@app.route('/api/buildings', methods=['GET'])
def get_buildings():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT building_name FROM room_info WHERE building_name IS NOT NULL ORDER BY building_name")
        rows = cursor.fetchall()
        conn.close()

        buildings = [row['building_name'] for row in rows]

        return jsonify({
            'buildings': buildings
        }), 200

    except pymysql.MySQLError as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500


@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    building_name = request.args.get('building_name')
    
    if not building_name:
        return jsonify({'error': 'The building_name parameter is required.'}), 400
        
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT room_number FROM room_info WHERE building_name = %s ORDER BY room_number", 
            (building_name,)
        )
        
        rows = cursor.fetchall()
        conn.close()
        room_numbers = [row['room_number'] for row in rows]

        if not room_numbers:
            return jsonify({
                'message': f'No rooms found for building: {building_name}', 
                'rooms': []
            }), 404

        return jsonify({
            'rooms': room_numbers
        }), 200

    except pymysql.MySQLError as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500


@app.route('/api/sensors', methods=['GET'])
def get_sensors():
    building_name = request.args.get('building_name')
    room_number = request.args.get('room_number')
    
    if not building_name or not room_number:
        return jsonify({'error': 'Both building_name and room_number parameters are required.'}), 400
        
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT s.sensor_id, s.sensor_type
            FROM sensor_info s
            JOIN room_info r ON s.room_id = r.room_id
            WHERE r.building_name = %s AND r.room_number = %s
        """
        cursor.execute(query, (building_name, room_number))
        
        sensors = cursor.fetchall()
        conn.close()

        sensor_type_id = []
        for sensor in sensors:
            sensor_type_id.append(f"{sensor['sensor_type']} {sensor['sensor_id']}")

        # 4. Return the results
        if not sensors:
            return jsonify({
                'message': f'No sensors found for {building_name}, Room {room_number}', 
                'sensors': []
            }), 404

        return jsonify({
            'sensors': sensor_type_id
        }), 200

    except pymysql.MySQLError as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    

@app.route('/api/sensor-columns', methods=['GET'])
def get_sensor_columns():
    sensor_input = request.args.get('sensor_type')
    
    if not sensor_input:
        return jsonify({'error': 'The sensor_type parameter is required.'}), 400
        
    sensor_type = sensor_input.split()[0]

    table_name = f"{sensor_type}_data"
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute(f"SHOW COLUMNS FROM `{table_name}`")
        rows = cursor.fetchall()
        conn.close()
        
        excluded_columns = {
            'record_id', 'sensor_id', 'timestamp', 'latitude', 'longitude', 
            'altitude', 'warningThreshold', 'alarmThreshold', 'raining',
            'coefficient_A', 'coefficient_B', 'coefficient_C', 'rain',
                            }
        numeric_type_prefixes = ('float', 'double', 'decimal', 'int', 'bigint', 'smallint', 'mediumint', 'numeric')

        columns = [
            row['Field'] for row in rows
            if row['Field'].lower() not in excluded_columns
            and row['Type'].lower().startswith(numeric_type_prefixes)
        ]
        if sensor_type == 'rad8' or sensor_type = 'sword' or sensor_type == 'gamon_s':
            columns.append('counts')
        return jsonify({
            'columns': columns
        }), 200

    except pymysql.MySQLError as e:
        # Error code 1146 means "Table doesn't exist" in MySQL
        if e.args[0] == 1146:
            return jsonify({'error': f'Table {table_name} does not exist.'}), 404
            
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/sensor-data', methods=['GET'])
def get_sensor_data():

    time_range_input = request.args.get('time_range')
    building_name = request.args.get('building_name')
    room_number = request.args.get('room_number')
    sensor_input = request.args.get('sensor')
    data_column = request.args.get('data_column')

    if not all([building_name, room_number, sensor_input, data_column]):
        return jsonify({'error': 'building_name, room_number, sensor, and data_column are required.'}), 400

    try:
        time_range = int(time_range_input)
    except ValueError:
        return jsonify({'error': 'time_range must be a valid number.'}), 400
    
    parts = sensor_input.split()
    sensor_type = parts[0].lower()

    try:
        sensor_id = int(parts[1])
    except ValueError:
        return jsonify({'error': 'Sensor ID must be a number.'}), 400

    table_name = f"{sensor_type}_data"

    # most tables call their time column "timestamp" - a few don't, so this
    # is where we point those at the right column name instead
    time_column_overrides = {
        'gamon_d_data': 'startDateTime',
    }
    time_column = time_column_overrides.get(table_name, 'timestamp')
    if sensor_type == 'sword':
        entries = time_range * 24
    else:
        entries = time_range * 24 * 6
    try:
        conn = get_connection()
        cursor = conn.cursor()
        if data_column == 'counts':
            if sensor_type == 'rad8':
                channel_cols = []
                channel_keys = []
                
                for i in range(1, 801):
                    if i <= 320:   suffix = "_f_low"
                    elif i <= 392: suffix = "_g_med"
                    elif i <= 448: suffix = "_h_210po"
                    elif i <= 512: suffix = "_a_218po"
                    elif i <= 576: suffix = "_b_216po"
                    elif i <= 656: suffix = "_c_214po"
                    elif i <= 744: suffix = "_d_212po"
                    else:          suffix = "_e_high"
                    
                    col_name = f"ch{i}{suffix}"
                    channel_keys.append(col_name)
                    channel_cols.append(f"`{col_name}`")
                    
                # Join them together with commas: `ch1_f_low`, `ch2_f_low`, ... `ch800_e_high`
                select_string = ", ".join(channel_cols)
                
                # 2. Build the query
                query = f"""
                    SELECT `{time_column}`, {select_string}
                    FROM (
                        SELECT `{time_column}`, {select_string}
                        FROM `{table_name}`
                        WHERE sensor_id = %s
                        ORDER BY `{time_column}` DESC
                        LIMIT {entries}
                    ) AS recent_data
                    ORDER BY `{time_column}` ASC
                """
            else:
                query = f"""
                    SELECT `{time_column}`, `coefficient_A`, `coefficient_B`, `coefficient_C`, `{data_column}`
                    FROM (
                        SELECT `{time_column}`, `coefficient_A`, `coefficient_B`, `coefficient_C`, `{data_column}`
                        FROM `{table_name}`
                        WHERE sensor_id = %s
                        ORDER BY `{time_column}` DESC
                        LIMIT {entries}
                    ) AS recent_data
                    ORDER BY `{time_column}` ASC
                """
        else:
            query = f"""
                SELECT `{time_column}`, `{data_column}`
                FROM (
                    SELECT `{time_column}`, `{data_column}`
                    FROM `{table_name}`
                    WHERE sensor_id = %s
                    ORDER BY `{time_column}` DESC
                    LIMIT {entries}
                ) AS recent_data
                ORDER BY `{time_column}` ASC
            """
        cursor.execute(query, (sensor_id,))
        rows = cursor.fetchall()
        conn.close()
        if data_column == 'counts':
            timestamps = []
            counts = []
            energy = []
            start_time = None
            end_time = None
            if sensor_type == 'rad8':
                counts = [0] * 800
                energy = [12.5 * i for i in range(1, 801)]
                for row in rows:
                    if start_time is None:
                        start_time = str(row[time_column])
                    end_time = str(row[time_column])
                    
                    for i, key in enumerate(channel_keys):
                        val = row[key] if row[key] is not None else 0
                        counts[i] += val
                if start_time and end_time:
                    timestamps = [f"{start_time} to {end_time}"] * 800
            else:
                total_channels = 1024
                e_min = 0
                e_max = 3000
                bin_width = (e_max - e_min) / (total_channels - 1)
                std_energy_axis = np.linspace(e_min, e_max, total_channels)
                std_counts = np.zeros(total_channels, dtype=np.int64)
                
                for row in rows:
                    json_string = row['counts']
                    if not json_string:
                        continue
                        
                    if start_time is None:
                        start_time = str(row[time_column])
                    end_time = str(row[time_column])
                
                    counts_array = np.array(json.loads(json_string))
                    channels = np.arange(len(counts_array))
                    
                    a = row['coefficient_A']
                    b = row['coefficient_B']
                    c = row['coefficient_C']
                    
                    energies = a * (channels**2) + b * channels + c
                    indices = np.round((energies - e_min) / bin_width).astype(int)
                    
                    for idx_val, count in zip(indices, counts_array):
                        if 0 <= idx_val < total_channels:
                            std_counts[idx_val] += count
                            
                if start_time and end_time:
                    timestamps = [f"{start_time} to {end_time}"] * total_channels
                
                energy = std_energy_axis.tolist()
                counts = std_counts.tolist()
            return jsonify({
                'building': building_name,
                'room': room_number,
                'sensor': sensor_input,
                'column': data_column,
                'data': {
                    'timestamps': timestamps,
                    'counts_y_axis': counts,
                    'values_x_axis': energy
                }
            }), 200
        else:
            values = [row[data_column] for row in rows]
            timestamps = [str(row[time_column]) for row in rows]
            return jsonify({
                'building': building_name,
                'room': room_number,
                'sensor': sensor_input,
                'column': data_column,
                'data': {
                    'timestamps': timestamps,
                    'values': values
                }
            }), 200

    except pymysql.MySQLError as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/presentation-data', methods=['GET'])
def get_presentation_data():
    sensors = {
        'rad8' : ['ambient_temp', 'relative_humidity', 'radon_pci_l'],
        'cr1000' : ["WindVel", "RainTotal"]
    }
    presentation_data = {}

    try:
        conn = get_connection()
        cursor = conn.cursor()

        for sensor_type, columns in sensors.items():
            table_name = f"{sensor_type}_data"
            time_column = 'timestamp'

            cols_str = ", ".join([f"`{col}`" for col in columns])

            query = f"""
                SELECT `sensor_id`, `{time_column}`, {cols_str}
                FROM `{table_name}`
                ORDER BY `{time_column}` DESC
                LIMIT 1
            """

            try:
                cursor.execute(query)
                row = cursor.fetchone()

                if row:
                    sensor_data = {
                        'sensor_id': row['sensor_id'],
                        'timestamp': str(row[time_column])
                    }
                    for col in columns:
                        sensor_data[col] = row[col]

                    presentation_data[sensor_type] = sensor_data
                else:
                    presentation_data[sensor_type] = None

            except pymysql.MySQLError as e:
                presentation_data[sensor_type] = {'error': str(e)}
        conn.close()
        return jsonify({
            'data': presentation_data
        }), 200

    except pymysql.MySQLError as e:
        return jsonify({'error': f'Database connection error: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)