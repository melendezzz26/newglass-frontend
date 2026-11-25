"""Arnés QA EN-CONC-001 (modo distribuido). Derivado de tests/multiuser/lab.py.

Copiar en una copia aislada del backend como
tests/integration/optimization/test_qa_frontend_lab.py y ejecutar en WSL2 con
PostgreSQL desechable (NEWGLASS_TEST_PG_BIN). Nunca usa DATABASE_URL compartida.

- Activa el piloto mixto (API + worker separado, una plaza).
- Levanta una API real en loopback y un worker_v2 que retiene FF del pedido del
  Operario hasta que la prueba de navegador marque `resume`.
- Escribe ready.json con credenciales efímeras de usuarios sintéticos.
- Espera `finish` o `abort`; no exige un recuento fijo de trabajos.
"""
import json
import os
from pathlib import Path
from secrets import token_urlsafe
import time

import pytest
from sqlalchemy import func, select

from app.models import MovimientoInventario, Plancha, RolPermiso, Usuario
from app.shared.security import hash_password
from tests.integration.optimization.test_comparison_v2_http_restart import activate, worker_db
from tests.integration.optimization.test_parallel_lab import orders_for


def write_state(path, data):
    pending = path.with_suffix(".tmp")
    pending.write_text(json.dumps(data), encoding="utf-8")
    pending.replace(path)


def test_qa_frontend_lab(worker_db):
    root = Path(os.environ["NEWGLASS_QA_LAB"])
    assert root.is_dir() and not (root / "ready.json").exists()
    data = worker_db
    activate(data, mixed=True)
    orders = orders_for(data, 6)  # pedidos de A, O y A sobre la plancha 1 (600 x 450 mm, 4 u.)
    actors = {}
    with data.sessions.begin() as db:
        db.add(RolPermiso(id_rol=data.role_ids["A"], id_permiso=data.codes["orders.view"]))
        for letter, actor in data.actors.items():
            user = db.get(Usuario, actor)
            password = token_urlsafe(18)
            user.password_hash = hash_password(password)
            actors[letter] = dict(username=user.usuario, password=password)
    _, api = data.services.api("qa-api")
    data.services.worker("qa-worker", hold=orders[1])
    ready = root / "ready.json"
    write_state(ready, dict(api=str(api.base_url), actors=actors, orders=orders))
    deadline = time.monotonic() + 1500
    while time.monotonic() < deadline:
        if (root / "abort").exists():
            pytest.fail("QA browser run aborted by the caller")
        if (root / "resume").exists():
            data.services.resume_file.touch()
        if (root / "finish").exists():
            break
        time.sleep(.1)
    else:
        pytest.fail("QA browser run did not finish before the deadline")
    with data.sessions() as db:
        movements = db.scalar(select(func.count()).select_from(MovimientoInventario))
        stock = db.get(Plancha, 1).cantidad
    (root / "db-summary.json").write_text(json.dumps(dict(movements=movements, sheet_1_quantity=stock)), encoding="utf-8")
