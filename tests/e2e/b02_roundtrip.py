"""B02 schema round-trip on the private PostgreSQL started for this Playwright phase."""
from hashlib import sha256
import json
import os
from pathlib import Path
import tempfile

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from tests.comparison_history import history_bytes, revision
from tests.e2e_server import STATE
from tests.integration.postgres_support import schema_snapshot

PREVIOUS = "s2cmp01a1b2c"
B02 = "s2cmp02d4e6f8"


def main():
    state = json.loads(STATE.read_text(encoding="utf-8"))
    root = Path(state["root"]).resolve()
    url = sa.make_url(state["database_url"])
    if (root.parent != Path(tempfile.gettempdir()).resolve()
            or not root.name.startswith("newglass-orders-e2e-")
            or not (root / "data" / "postmaster.pid").is_file()
            or url.get_backend_name() != "postgresql"
            or url.host != "127.0.0.1" or url.username != "r1_test" or not url.database.startswith("r1_")):
        raise RuntimeError("B02 requires the owned, disposable Playwright PostgreSQL")
    os.environ.update(DATABASE_URL=url.render_as_string(hide_password=False), PYTHON_DOTENV_DISABLED="1")
    config = Config("alembic.ini")
    engine = sa.create_engine(url, poolclass=sa.pool.NullPool)

    def history():
        return history_bytes(engine, include_ff_request_key=False)

    def digest(rows):
        return {table: sha256(content.encode()).hexdigest() for table, content in rows.items()}

    def require_history(expected, actual, stage):
        changed = [table for table in expected if expected[table] != actual[table]]
        assert not changed, f"History changed during {stage}: {', '.join(changed)}"

    try:
        head = revision(engine)
        before = history()
        assert all(json.loads(before[table]) for table in ("optimizaciones", "ejecuciones_optimizacion", "metricas_ejecucion"))
        with engine.connect() as connection:
            assert connection.scalar(sa.text("SELECT to_regclass('public.intentos_login')")) is not None
            assert connection.scalar(sa.text("SELECT count(*) FROM optimizaciones")) >= 2
            assert connection.scalar(sa.text("SELECT count(*) FROM optimizaciones WHERE criterio_seleccion_version = 'CMP-v2'")) == 0
        # HTTP creates history with the current schema. Keep the API idle during the
        # round-trip so modern authentication never queries a historical schema.
        try:
            command.downgrade(config, PREVIOUS)
            assert revision(engine) == PREVIOUS
            require_history(before, history(), "downgrade to B02 predecessor")
            constraints_before = schema_snapshot(engine, ["ejecuciones_optimizacion"])
            command.upgrade(config, B02)
            assert revision(engine) == B02
            require_history(before, history(), "B02 upgrade")
            constraints_after = schema_snapshot(engine, ["ejecuciones_optimizacion"])
        finally:
            command.upgrade(config, head)
        after = history()
        assert revision(engine) == head
        require_history(before, after, "head restoration")
        with engine.connect() as connection:
            assert connection.scalar(sa.text("SELECT to_regclass('public.intentos_login')")) is not None
        print(json.dumps(dict(result="PASS", previous_revision=PREVIOUS, b02_revision=B02, restored_revision=head,
                              before_sha256=digest(before), after_sha256=digest(after),
                              constraints_before=constraints_before, constraints_after=constraints_after), default=str))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
