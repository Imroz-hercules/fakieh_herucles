import os

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from models import db
from models.client import Client

client_bp = Blueprint('client', __name__, url_prefix='/api/clients')

_LIST_MAX = int(os.getenv('CLIENT_LIST_MAX', '2000'))
_LIST_DEFAULT = int(os.getenv('CLIENT_LIST_DEFAULT', '50'))


def _limit_offset():
    try:
        limit = int(request.args.get('limit', _LIST_DEFAULT))
    except ValueError:
        limit = _LIST_DEFAULT
    limit = max(1, min(limit, _LIST_MAX))
    try:
        offset = int(request.args.get('offset', 0))
    except ValueError:
        offset = 0
    return limit, max(0, offset)


def _client_query():
    q = Client.query

    id_param = (request.args.get('id') or '').strip()
    if id_param:
        try:
            q = q.filter(Client.id == int(id_param))
        except ValueError:
            raise ValueError('id must be an integer')

    name_param = (request.args.get('name') or '').strip()
    if name_param:
        q = q.filter(func.lower(Client.name).contains(name_param.lower()))

    return q


def _parse_body():
    data = request.get_json(force=True) or {}
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    client_number = (data.get('client_number') or '').strip()
    if not name:
        return None, jsonify({'error': 'Missing required field: name'}), 400
    if not phone:
        return None, jsonify({'error': 'Missing required field: phone'}), 400
    if not client_number:
        return None, jsonify({'error': 'Missing required field: client_number'}), 400
    return {'name': name, 'phone': phone, 'client_number': client_number}, None, None


@client_bp.route('/', methods=['GET'])
def get_clients():
    try:
        limit, offset = _limit_offset()
        q = _client_query().order_by(Client.id.desc())
        total = q.count()
        clients = q.limit(limit).offset(offset).all()
        return jsonify(
            {
                'items': [c.to_dict() for c in clients],
                'total': total,
                'limit': limit,
                'offset': offset,
                'has_more': offset + len(clients) < total,
            }
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'error': f'Failed to fetch clients: {exc}'}), 500


@client_bp.route('/<int:client_id>', methods=['GET'])
def get_client(client_id):
    client = Client.query.get(client_id)
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    return jsonify(client.to_dict())


@client_bp.route('/', methods=['POST'])
def create_client():
    try:
        fields, err_resp, status = _parse_body()
        if err_resp is not None:
            return err_resp, status

        client = Client(
            name=fields['name'],
            phone=fields['phone'],
            client_number=fields['client_number'],
        )
        db.session.add(client)
        db.session.commit()
        return jsonify(client.to_dict()), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': f'Failed to create client: {exc}'}), 500


@client_bp.route('/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    try:
        client = Client.query.get(client_id)
        if not client:
            return jsonify({'error': 'Client not found'}), 404

        fields, err_resp, status = _parse_body()
        if err_resp is not None:
            return err_resp, status

        client.name = fields['name']
        client.phone = fields['phone']
        client.client_number = fields['client_number']
        db.session.commit()
        return jsonify(client.to_dict())
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': f'Failed to update client: {exc}'}), 500


@client_bp.route('/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    try:
        client = Client.query.get(client_id)
        if not client:
            return jsonify({'error': 'Client not found'}), 404

        db.session.delete(client)
        db.session.commit()
        return '', 204
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': f'Failed to delete client: {exc}'}), 500
