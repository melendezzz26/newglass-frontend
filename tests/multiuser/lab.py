"""Run this pytest harness from the merged backend root with an isolated WSL2 interpreter."""
import json
import os
from pathlib import Path
from secrets import token_urlsafe
import time

import pytest
from sqlalchemy import func, select

from app.models import MovimientoInventario, OptimizationWorkerAttempt, OptimizationWorkerJob, Plancha, RolPermiso, Usuario
from app.shared.security import hash_password
from tests.integration.optimization.test_comparison_v2_http_restart import activate, worker_db
from tests.integration.optimization.test_parallel_lab import isolated_slice, orders_for

def write_state(path, data):
    pending = path.with_suffix(".tmp")
    pending.write_text(json.dumps(data), encoding="utf-8")
    pending.replace(path)


def test_browser_lab(worker_db, tmp_path):
    root = Path(os.environ["NEWGLASS_BROWSER_LAB"])
    assert root.is_dir() and not (root / "ready.json").exists()
    capacity = int(os.environ["NEWGLASS_BROWSER_CAPACITY"])
    assert capacity in (1, 2)
    data = worker_db
    activate(data, mixed=True)
    orders = orders_for(data, 20)
    actors = {}
    with data.sessions.begin() as db:
        db.add(RolPermiso(id_rol=data.role_ids['A'], id_permiso=data.codes['orders.view']))
        for letter, actor in data.actors.items():
            user = db.get(Usuario, actor)
            password = token_urlsafe(18)
            user.password_hash = hash_password(password)
            actors[letter] = dict(username=user.usuario, password=password)

    process_a, api_a = data.services.api("browser-api-a")
    _, api_b = data.services.api("browser-api-b")
    with isolated_slice(data, capacity) as (_, start):
        for number in (1, 2):
            start(number, tmp_path, partners=orders[:2] if capacity == 2 else (), holds=orders[:2])
        state = dict(capacity=capacity, orders=orders, actors=actors, original_stock=1, legacy_order=data.orders['L'],
                     api_a=str(api_a.base_url), api_b=str(api_b.base_url))
        ready = root / "ready.json"
        write_state(ready, state)
        deadline = time.monotonic() + 360
        restarted = False
        while time.monotonic() < deadline:
            if (root / "abort").exists():
                pytest.fail("Browser pilot aborted by the caller")
            for actor, order in zip(("a", "b"), orders[:2]):
                if (root / f"resume_{actor}").exists():
                    (tmp_path / f"resume-{order}").touch()
            if (root / "restart_a").exists() and not restarted:
                data.services.stop(process_a)
                _, api_a = data.services.api("browser-api-a-restarted")
                state["api_a"] = str(api_a.base_url)
                write_state(ready, state)
                restarted = True
            if (root / "finish").exists():
                break
            time.sleep(.1)
        else:
            pytest.fail("Browser test did not finish before the laboratory deadline")
        with data.sessions() as db:
            jobs = db.scalars(select(OptimizationWorkerJob)).all()
            assert sorted(job.kind for job in jobs) == ["FF", "V1", "V2", "V2", "V2"]
            assert all(job.state == "TERMINAL" and job.generation == 1 and job.slot is None for job in jobs)
            assert db.scalar(select(func.count()).select_from(OptimizationWorkerAttempt)) == 5
            assert db.get(Plancha, 1).cantidad == 4
            assert db.scalar(select(func.count()).select_from(MovimientoInventario)) == 0
